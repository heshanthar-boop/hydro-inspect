package com.hydroinspect.operator;

import android.app.Application;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.FirebaseFirestoreSettings;

public class HydroApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        FirebaseApp.initializeApp(this, new FirebaseOptions.Builder()
            .setApiKey("AIzaSyBs2ZkUSv7Ujv5qvPwMuuco6QY_gMwB1K8")
            .setApplicationId("1:956132048124:android:92c8308e09ae4202152b79")
            .setProjectId("solarpv-field-tool").build());
        FirebaseFirestore.getInstance().setFirestoreSettings(new FirebaseFirestoreSettings.Builder().setPersistenceEnabled(true).build());
        SyncWorker.schedulePeriodic(this);
    }
}
