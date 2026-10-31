package com.hydroinspect.operator;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.*;

/** SQLite is the durable source of truth for drafts and the immutable upload outbox. */
public class LocalStore extends SQLiteOpenHelper {
    public LocalStore(Context c) { super(c, "operator.db", null, 1); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE readings(id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL, error TEXT NOT NULL DEFAULT '')");
        db.execSQL("CREATE TABLE cache(id TEXT PRIMARY KEY, payload TEXT NOT NULL)");
        db.execSQL("CREATE TABLE draft(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db,int old,int version) { }
    public synchronized void saveDraft(String json) {
        ContentValues v=new ContentValues();v.put("id",1);v.put("payload",json);
        getWritableDatabase().insertWithOnConflict("draft",null,v,SQLiteDatabase.CONFLICT_REPLACE);
    }
    public synchronized JSONObject draft() throws JSONException {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM draft WHERE id=1",null)) {
            return c.moveToFirst()?new JSONObject(c.getString(0)):new JSONObject();
        }
    }
    public synchronized void submit(JSONObject r) throws JSONException {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {
            ContentValues v=new ContentValues();v.put("id",r.getString("id"));v.put("payload",r.toString());v.put("state","pending");
            // Never overwrite a submitted reading, even if the bridge is called twice.
            db.insertWithOnConflict("readings",null,v,SQLiteDatabase.CONFLICT_IGNORE);
            db.delete("draft",null,null);db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
    public synchronized JSONArray rows(boolean pendingOnly) throws JSONException {
        JSONArray list=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT payload,state,error FROM readings"+(pendingOnly?" WHERE state='pending'":""),null)) {
            while(c.moveToNext()) {JSONObject r=new JSONObject(c.getString(0));r.put("localState",c.getString(1));r.put("syncError",c.getString(2));list.put(r);}
        }
        return list;
    }
    public synchronized void mark(String id,String state,String error) {
        ContentValues v=new ContentValues();v.put("state",state);v.put("error",error);
        getWritableDatabase().update("readings",v,"id=?",new String[]{id});
    }
    public synchronized void cache(String id,JSONObject r) {
        ContentValues v=new ContentValues();v.put("id",id);v.put("payload",r.toString());
        getWritableDatabase().insertWithOnConflict("cache",null,v,SQLiteDatabase.CONFLICT_REPLACE);
    }
    public synchronized JSONArray cached() throws JSONException {
        JSONArray list=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM cache",null)) {
            while(c.moveToNext())list.put(new JSONObject(c.getString(0)));
        }return list;
    }
}
