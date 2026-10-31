package com.hydroinspect.operator;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.*;
import android.webkit.*;
import androidx.webkit.WebViewAssetLoader;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.*;
import org.json.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class MainActivity extends Activity {
    private WebView web;
    private LocalStore store;
    private ListenerRegistration listener;
    private ListenerRegistration configListener;
    private static final String HOME="https://appassets.androidplatform.net/assets/index.html";
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);store=new LocalStore(this);
        web=new WebView(this);setContentView(web);
        web.setBackgroundColor(android.graphics.Color.rgb(242,247,249));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return loader.shouldInterceptRequest(request.getUrl());}
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !HOME.equals(request.getUrl().toString());}
        });
        web.addJavascriptInterface(new Bridge(),"HydroAndroid");
        web.loadUrl(HOME);
        if(Build.VERSION.SDK_INT>=35) {
            web.setOnApplyWindowInsetsListener((v,insets)->{
                android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.ime());
                v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
            });
        }
    }
    @Override public void onResume(){super.onResume();SyncWorker.enqueue(this);watch();}
    private void watch(){
        if(listener!=null)return;
        configListener=FirebaseFirestore.getInstance().document("hydro_workspaces/main/config/meters").addSnapshotListener((doc,error)->{
            if(doc!=null&&doc.exists())try{
                Object changes=SyncWorker.value(doc.get("meterChanges"));
                getSharedPreferences("install",MODE_PRIVATE).edit().putString("meterChanges",changes.toString()).apply();
            }catch(JSONException ignored){}
        });
        listener=FirebaseFirestore.getInstance().collection(SyncWorker.COLLECTION).addSnapshotListener((snapshot,error)->{
            if(snapshot==null)return;
            for(DocumentChange change:snapshot.getDocumentChanges()) {
                try {
                    JSONObject r=SyncWorker.json(change.getDocument().getData());r.put("id",change.getDocument().getId());
                    if(change.getType()==DocumentChange.Type.REMOVED)r.put("_deleted",true);
                    store.cache(change.getDocument().getId(),r);
                }catch(JSONException ignored){ }
            }
        });
    }
    @Override public void onPause(){if(listener!=null){listener.remove();listener=null;}if(configListener!=null){configListener.remove();configListener=null;}super.onPause();}
    @Override public void onDestroy(){web.removeJavascriptInterface("HydroAndroid");web.destroy();store.close();super.onDestroy();}
    @Override public void onBackPressed(){web.evaluateJavascript("window.operatorBack && window.operatorBack()",null);}
    private String deviceId(){
        android.content.SharedPreferences p=getSharedPreferences("install",MODE_PRIVATE);
        String id=p.getString("deviceId",null);if(id==null){id=UUID.randomUUID().toString();p.edit().putString("deviceId",id).commit();}return id;
    }
    private JSONObject getDraft() throws JSONException {
        JSONObject d=store.draft();if(!d.has("id")){
            d.put("id","daily_android_"+UUID.randomUUID());d.put("readings",new JSONObject());
            d.put("operator",getSharedPreferences("install",MODE_PRIVATE).getString("operator",""));store.saveDraft(d.toString());
        }return d;
    }
    public class Bridge {
        @JavascriptInterface public String state(){
            try {
                ConnectivityManager cm=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
                NetworkCapabilities n=cm.getNetworkCapabilities(cm.getActiveNetwork());
                boolean online=n!=null&&n.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                return new JSONObject().put("draft",getDraft()).put("local",store.rows(false)).put("remote",store.cached())
                    .put("online",online).put("version","1.0.0").put("deviceId",deviceId())
                    .put("meterChanges",new JSONArray(getSharedPreferences("install",MODE_PRIVATE).getString("meterChanges","[]"))).toString();
            }catch(Exception e){return "{\"error\":\"Unable to read saved data. Restart the app.\"}";}
        }
        @JavascriptInterface public String saveDraft(String json){
            try {
                if(json.length()>20000)throw new IllegalArgumentException("Entry too large");
                JSONObject d=new JSONObject(json);
                if(!getDraft().getString("id").equals(d.getString("id")))throw new IllegalArgumentException("This entry is already submitted");
                store.saveDraft(d.toString());return "";
            }catch(Exception e){return e.getMessage();}
        }
        @JavascriptInterface public synchronized String submit(String json){
            try {
                JSONObject d=new JSONObject(json);
                if(!getDraft().getString("id").equals(d.getString("id")))throw new IllegalArgumentException("This reading has already been submitted");
                JSONObject numbers=d.getJSONObject("readings");Map<String,String> values=new HashMap<>();
                for(String key:ReadingPolicy.KEYS)values.put(key,numbers.optString(key,""));
                ReadingPolicy.validate(d.optString("operator"),values);
                long now=System.currentTimeMillis();ZonedDateTime time=Instant.ofEpochMilli(now).atZone(ZoneId.of("Asia/Colombo"));
                JSONObject actor=new JSONObject().put("uid",FirebaseAuth.getInstance().getCurrentUser()==null?"":FirebaseAuth.getInstance().getCurrentUser().getUid())
                    .put("email","").put("visitor",true).put("deviceId",deviceId())
                    .put("deviceLabel",Build.MANUFACTURER+" "+Build.MODEL).put("userAgent","HydroInspect Android/1.0.0 Android/"+Build.VERSION.RELEASE)
                    .put("clientTime",Instant.ofEpochMilli(now).toString()).put("timezone","Asia/Colombo");
                JSONObject r=new JSONObject().put("id",d.getString("id")).put("plant",ReadingPolicy.PLANT)
                    .put("operator",d.getString("operator")).put("date",time.toLocalDate().toString())
                    .put("time",time.format(DateTimeFormatter.ofPattern("HH:mm:ss"))).put("capturedAtMillis",now)
                    .put("timestampSource","device-clock").put("source","android-operator").put("draft",false)
                    .put("notes",d.optString("notes","")).put("readings",new JSONObject(values))
                    .put("units",new JSONObject("{\"cebImport\":\"kWh\",\"cebExport\":\"kWh\",\"gen1\":\"MWh\",\"gen2\":\"MWh\",\"transformer\":\"MWh\",\"lt\":\"kWh\"}"))
                    .put("unitSchemaVersion",1).put("updatedAt",Instant.ofEpochMilli(now).toString())
                    .put("audit",new JSONObject().put("created",actor).put("lastEdited",new JSONObject(actor.toString())));
                if(r.getString("notes").length()>4000)throw new IllegalArgumentException("Keep notes below 4000 characters");
                store.submit(r);
                getSharedPreferences("install",MODE_PRIVATE).edit().putString("operator",d.getString("operator")).apply();
                SyncWorker.enqueue(MainActivity.this);return "";
            }catch(Exception e){return e.getMessage()==null?"Could not save reading. Please retry.":e.getMessage();}
        }
        @JavascriptInterface public void sync(){SyncWorker.enqueue(MainActivity.this);}
        @JavascriptInterface public void owner(){runOnUiThread(()->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://heshanthar-boop.github.io/hydro-inspect/#daily"))));}
        @JavascriptInterface public void close(){runOnUiThread(()->finish());}
    }
}
