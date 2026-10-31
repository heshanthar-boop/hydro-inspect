package com.hydroinspect.operator;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;
public class ReadingPolicyTest {
    Map<String,String> values(String value){Map<String,String> r=new HashMap<>();for(String k:ReadingPolicy.KEYS)r.put(k,value);return r;}
    @Test public void acceptsZeroAndNativeMWhPrecision(){ReadingPolicy.validate("Athula",values("0"));ReadingPolicy.validate("Upul",values("970.400001"));}
    @Test public void rejectsMissingMeter(){Map<String,String> r=values("1");r.remove("lt");assertThrows(IllegalArgumentException.class,()->ReadingPolicy.validate("Athula",r));}
    @Test public void rejectsInvalidValues(){for(String v:new String[]{"","-1","NaN","1e8","1,000","1.1234567"})assertThrows(IllegalArgumentException.class,()->ReadingPolicy.validate("Athula",values(v)));}
    @Test public void requiresNamedOperator(){assertThrows(IllegalArgumentException.class,()->ReadingPolicy.validate("Visitor",values("1")));}
}
