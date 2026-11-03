package com.laundrylounge.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;

public final class Ui {
    public static final int INK=Color.rgb(35,63,55), MUTED=Color.rgb(99,124,111), TEAL=Color.rgb(0,139,128), BG=Color.rgb(245,248,246), BORDER=Color.rgb(222,234,225);
    public static int dp(Context c,int n){return Math.round(c.getResources().getDisplayMetrics().density*n);}
    public static LinearLayout column(Context c){LinearLayout v=new LinearLayout(c);v.setOrientation(LinearLayout.VERTICAL);v.setLayoutParams(new LinearLayout.LayoutParams(-1,-2));return v;}
    public static LinearLayout row(Context c){LinearLayout v=new LinearLayout(c);v.setOrientation(LinearLayout.HORIZONTAL);v.setGravity(android.view.Gravity.CENTER_VERTICAL);v.setLayoutParams(new LinearLayout.LayoutParams(-1,-2));return v;}
    public static GradientDrawable background(int color,int border,Context c,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(c,radius));if(border!=0)d.setStroke(dp(c,1),border);return d;}
    public static LinearLayout card(Context c){LinearLayout v=column(c);int p=dp(c,17);v.setPadding(p,p,p,p);v.setBackground(background(Color.WHITE,BORDER,c,14));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(c,13);v.setLayoutParams(lp);return v;}
    public static TextView text(Context c,String value,int size,int color,boolean bold){TextView v=new TextView(c);v.setText(value==null?"":value);v.setTextSize(size);v.setTextColor(color);v.setFontFeatureSettings("kern");v.setLineSpacing(dp(c,2),1);if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;}
    public static TextView title(Context c,String value){return text(c,value,27,INK,true);}
    public static Button button(Context c,String value,Runnable action,boolean secondary){Button b=new Button(c);b.setText(value);b.setAllCaps(false);b.setTextSize(13);b.setTypeface(Typeface.DEFAULT,Typeface.BOLD);b.setTextColor(secondary?TEAL:Color.WHITE);b.setMinHeight(dp(c,48));b.setMinimumHeight(dp(c,48));b.setMinWidth(0);b.setMinimumWidth(0);b.setPadding(dp(c,12),dp(c,7),dp(c,12),dp(c,7));b.setBackground(background(secondary?Color.WHITE:TEAL,secondary?BORDER:0,c,10));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(c,7);p.bottomMargin=dp(c,7);b.setLayoutParams(p);b.setOnClickListener(v->action.run());return b;}
    public static EditText field(Context c,LinearLayout parent,String label,String value,int inputType){TextView l=text(c,label,12,MUTED,true);parent.addView(l);EditText e=new EditText(c);e.setSingleLine((inputType&android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE)==0);e.setInputType(inputType);e.setTextSize(15);e.setTextColor(INK);e.setHintTextColor(MUTED);e.setText(value==null?"":value);e.setContentDescription(label);e.setMinHeight(dp(c,48));e.setPadding(dp(c,12),dp(c,10),dp(c,12),dp(c,10));e.setBackground(background(Color.WHITE,BORDER,c,9));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(c,7);p.bottomMargin=dp(c,16);parent.addView(e,p);return e;}
    public static Spinner spinner(Context c,LinearLayout parent,String label,String[] values,int selected){parent.addView(text(c,label,12,MUTED,true));Spinner s=new Spinner(c);s.setAdapter(new ArrayAdapter<>(c,android.R.layout.simple_spinner_dropdown_item,values));s.setSelection(Math.max(0,Math.min(selected,values.length-1)));s.setContentDescription(label);s.setMinimumHeight(dp(c,48));s.setBackground(background(Color.WHITE,BORDER,c,9));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(c,48));p.topMargin=dp(c,7);p.bottomMargin=dp(c,16);parent.addView(s,p);return s;}
    public static ScrollView scroll(Context c,View child){ScrollView s=new ScrollView(c);s.setFillViewport(false);s.setClipToPadding(false);s.addView(child);return s;}
    public static AlertDialog dialog(Activity a,String title,View body){ScrollView scroll=scroll(a,body);scroll.setPadding(dp(a,8),dp(a,6),dp(a,8),dp(a,6));AlertDialog d=new AlertDialog.Builder(a).setTitle(title).setView(scroll).setNegativeButton("Close",null).create();d.setOnShowListener(x->{d.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);d.getWindow().setLayout(-1,-2);});d.show();return d;}
    public static void gap(Context c,LinearLayout parent,int dp){View v=new View(c);parent.addView(v,new LinearLayout.LayoutParams(1,dp(c,dp)));}
}
