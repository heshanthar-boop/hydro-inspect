package com.hydroinspect.operator;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.util.concurrent.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class OfflineStorageTest {
    @Test public void durableOutboxAndIdempotentSubmission() throws Exception {
        Context context=ApplicationProvider.getApplicationContext();String name="isolated-qa.db";context.deleteDatabase(name);
        try {
            try(LocalStore db=new LocalStore(context,name)) {
                db.saveDraft("{\"id\":\"qa\",\"readings\":{\"gen1\":\"12.3456\"}}");
            }
            try(LocalStore db=new LocalStore(context,name)) {
                assertEquals("12.3456",db.draft().getJSONObject("readings").getString("gen1"));
                db.submit(new JSONObject("{\"id\":\"qa\",\"operator\":\"Athula\",\"readings\":{\"lt\":\"0\"}}"));
                db.submit(new JSONObject("{\"id\":\"qa\",\"operator\":\"Upul\",\"readings\":{\"lt\":\"999\"}}"));
                assertEquals(0,db.draft().length());assertEquals(1,db.rows(true).length());
                assertEquals("Athula",db.rows(true).getJSONObject(0).getString("operator"));
                assertEquals("0",db.rows(true).getJSONObject(0).getJSONObject("readings").getString("lt"));
                db.mark("qa","attention","review");assertEquals(0,db.rows(true).length());db.retryAttention();assertEquals(1,db.rows(true).length());
            }
            try(LocalStore db=new LocalStore(context,name)){assertEquals(1,db.rows(true).length());}
        }finally{context.deleteDatabase(name);}
    }
    @Test public void packagedInterfaceStartsOfflineAndDraftSurvivesRecreation() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            final String[] id={null};
            scenario.onActivity(a->{try{
                MainActivity.Bridge bridge=a.new Bridge();JSONObject d=new JSONObject(bridge.state()).getJSONObject("draft");
                id[0]=d.getString("id");d.put("operator","Athula");d.put("readings",new JSONObject().put("gen1","970.400001"));
                assertEquals("",bridge.saveDraft(d.toString()));
            }catch(JSONException e){throw new AssertionError(e);}});
            scenario.recreate();
            scenario.onActivity(a->{try{
                JSONObject d=new JSONObject(a.new Bridge().state()).getJSONObject("draft");
                assertEquals(id[0],d.getString("id"));assertEquals("970.400001",d.getJSONObject("readings").getString("gen1"));
            }catch(JSONException e){throw new AssertionError(e);}});
            // Confirm that the actual Android WebView loaded the packaged JS and UI.
            boolean ready=false;
            for(int i=0;i<30&&!ready;i++){
                CountDownLatch latch=new CountDownLatch(1);String[] value={null};
                scenario.onActivity(a->{android.webkit.WebView v=(android.webkit.WebView)((android.view.ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);
                    v.evaluateJavascript("!!document.querySelector('#reading') && typeof OperatorModel !== 'undefined'",s->{value[0]=s;latch.countDown();});});
                assertTrue(latch.await(5,TimeUnit.SECONDS));ready="true".equals(value[0]);if(!ready)Thread.sleep(300);
            }
            assertTrue("Packaged operator UI should render without internet",ready);
        }
    }
}
