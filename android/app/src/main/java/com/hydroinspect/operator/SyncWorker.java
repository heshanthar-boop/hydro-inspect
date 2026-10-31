package com.hydroinspect.operator;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.Timestamp;
import com.google.firebase.auth.*;
import com.google.firebase.firestore.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Network-constrained persistent work survives process death and device restarts. */
public class SyncWorker extends Worker {
    static final String COLLECTION="hydro_workspaces/main/hydro_daily_readings";
    public SyncWorker(@NonNull Context c,@NonNull WorkerParameters p) {super(c,p);}
    static Constraints network() {return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();}
    public static void enqueue(Context c) {
        WorkManager.getInstance(c).enqueueUniqueWork("hydro-upload",ExistingWorkPolicy.APPEND_OR_REPLACE,
            new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(network()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build());
    }
    public static void schedulePeriodic(Context c) {
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("hydro-recovery",ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(SyncWorker.class,15,TimeUnit.MINUTES).setConstraints(network()).build());
    }
    @NonNull @Override public Result doWork() {
        try(LocalStore local=new LocalStore(getApplicationContext())) {
            JSONArray pending=local.rows(true);if(pending.length()==0)return Result.success();
            FirebaseAuth auth=FirebaseAuth.getInstance();
            if(auth.getCurrentUser()==null)Tasks.await(auth.signInAnonymously(),45,TimeUnit.SECONDS);
            String uid=auth.getCurrentUser().getUid();FirebaseFirestore db=FirebaseFirestore.getInstance();
            boolean retry=false;
            for(int i=0;i<pending.length();i++) {
                if(isStopped())return Result.retry();
                JSONObject row=pending.getJSONObject(i);String id=row.getString("id");
                try {
                    Map<String,Object> payload=toMap(row);
                    payload.remove("localState");payload.remove("syncError");
                    Map<String,Object> audit=(Map<String,Object>)payload.get("audit");
                    ((Map<String,Object>)audit.get("created")).put("uid",uid);
                    ((Map<String,Object>)audit.get("lastEdited")).put("uid",uid);
                    payload.put("capturedAt",new Timestamp(new Date(row.getLong("capturedAtMillis"))));
                    payload.put("readingAt",FieldValue.serverTimestamp());
                    payload.put("_serverEditedAt",FieldValue.serverTimestamp());
                    payload.put("_shared",true);payload.put("_pendingSync",false);
                    DocumentReference ref=db.collection(COLLECTION).document(id);
                    DocumentSnapshot saved=Tasks.await(db.runTransaction(tx->{
                        DocumentSnapshot existing=tx.get(ref);
                        // A retry after an interrupted acknowledgement must never edit a server record.
                        if(existing.exists())return existing;
                        tx.set(ref,payload);return null;
                    }),60,TimeUnit.SECONDS);
                    if(saved==null)saved=Tasks.await(ref.get(Source.SERVER),30,TimeUnit.SECONDS);
                    local.cache(id,json(saved.getData()));
                    local.mark(id,"synced","");
                } catch(Exception e) {
                    Throwable cause=e;while(cause.getCause()!=null)cause=cause.getCause();
                    boolean denied=cause instanceof FirebaseFirestoreException && ((FirebaseFirestoreException)cause).getCode()==FirebaseFirestoreException.Code.PERMISSION_DENIED;
                    // Retain the record and display a useful error; never discard a rejected reading.
                    local.mark(id,denied?"attention":"pending",denied?"Upload rejected. Ask the owner to review this record.":"Waiting for a working connection. Will retry automatically.");
                    retry|=!denied;
                }
            }
            return retry?Result.retry():Result.success();
        }catch(Exception e){return Result.retry();}
    }
    static Map<String,Object> toMap(JSONObject object) throws JSONException {
        Map<String,Object> result=new HashMap<>();Iterator<String> keys=object.keys();
        while(keys.hasNext()){String k=keys.next();Object v=object.get(k);if(v instanceof JSONObject)v=toMap((JSONObject)v);if(v==JSONObject.NULL)v=null;result.put(k,v);}return result;
    }
    static Object value(Object v) throws JSONException {
        if(v instanceof Timestamp){Timestamp t=(Timestamp)v;return new JSONObject().put("seconds",t.getSeconds()).put("nanoseconds",t.getNanoseconds());}
        if(v instanceof Map)return json((Map<String,Object>)v);
        if(v instanceof List){JSONArray a=new JSONArray();for(Object item:(List<?>)v)a.put(value(item));return a;}
        return v==null?JSONObject.NULL:v;
    }
    static JSONObject json(Map<String,Object> map) throws JSONException {
        JSONObject o=new JSONObject();if(map!=null)for(Map.Entry<String,Object> e:map.entrySet())o.put(e.getKey(),value(e.getValue()));return o;
    }
}
