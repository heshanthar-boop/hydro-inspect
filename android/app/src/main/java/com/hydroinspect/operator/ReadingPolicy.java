package com.hydroinspect.operator;

import java.math.BigDecimal;
import java.util.*;

public final class ReadingPolicy {
    public static final String PLANT="Kumburutheniwela Mini Hydro Power";
    public static final String[] KEYS={"cebImport","cebExport","gen1","gen2","transformer","lt"};
    public static final Set<String> OPERATORS=Set.of("Athula","Hirusha","Lasantha","Nalinda","Priyantha","Supun","Upul");
    public static void validate(String operator, Map<String,String> readings) {
        if(!OPERATORS.contains(operator))throw new IllegalArgumentException("Choose an operator");
        for(String key:KEYS) {
            String raw=readings.get(key);
            if(raw==null || !raw.matches("[0-9]{1,12}(\\.[0-9]{1,6})?"))throw new IllegalArgumentException("Enter a valid reading for every meter (up to 6 decimal places)");
            if(new BigDecimal(raw).signum()<0)throw new IllegalArgumentException("Readings cannot be negative");
        }
    }
}
