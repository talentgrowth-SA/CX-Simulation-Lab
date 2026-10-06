# CX Simulation Lab V12 LIVE — Deployment Guide

## الحالة الحالية
- مشروع Supabase مرتبط فعليًا: `cdvumwodsyygiqqdmuij`
- قاعدة البيانات والجداول وRLS مفعلة.
- `cx-config.js` يحتوي Project URL + Publishable Key الآمن للنشر في المتصفح.
- لا تضع Service Role Key في GitHub مطلقًا.

## خطوة Supabase الوحيدة قبل اختبار المتدرب
من Supabase Dashboard افتح:
**Authentication → Providers → Anonymous Sign-Ins**
وفعّل **Allow anonymous sign-ins** ثم Save.

المنصة تستخدم Anonymous Auth فقط لإنشاء هوية تقنية لكل متدرب، ثم تربطها بكود الدخول الخاص به. البيانات محمية بواسطة RLS ولا يستطيع المتدرب قراءة سجلات الآخرين.

## تهيئة حساب المدير لأول مرة
1. افتح `admin.html` بعد النشر.
2. أدخل بريدك وكلمة مرور قوية (8 أحرف على الأقل).
3. افتح **تهيئة أول حساب مدير**.
4. أدخل رمز التهيئة الذي استلمته بشكل منفصل.
5. اضغط **إنشاء/اعتماد حساب المدير**.
6. إذا طلب Supabase تأكيد البريد، أكده ثم عد وسجل الدخول وأكمل الاعتماد.

بعد نجاح الخطوة الأولى يُستهلك رمز التهيئة ولا يمكن استخدامه لإنشاء مدير ثانٍ.

## رفع GitHub Pages
ارفع الملفات التالية إلى جذر المستودع:
- `index.html`
- `admin.html`
- `cx-config.js`
- `.nojekyll`

ثم GitHub → Settings → Pages → Deploy from branch → `main` / root.

## بعد النشر
- رابط المتدربين: `/index.html`
- رابط الإدارة: `/admin.html`
- من لوحة الإدارة اختر **إنشاء أكواد** ثم وزع لكل متدرب كوده الخاص.
