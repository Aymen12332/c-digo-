@@ .. @@
 import express from "express";
 import { createServer } from "http";
 import { WebSocketServer } from "ws";
 import path from "path";
 import { fileURLToPath } from "url";
 import dotenv from "dotenv";
 import session from "express-session";
 import ConnectPgSimple from "connect-pg-simple";
 import { db } from "./db.js";
 import { adminRoutes } from "./routes/admin.js";
 import { customerRoutes } from "./routes/customer.js";
 import { driverRoutes } from "./routes/driver.js";
 import { publicRoutes } from "./routes/public.js";
 import { setupVite, serveStatic } from "./vite.js";
 
 dotenv.config();
 
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = path.dirname(__filename);
 
 const app = express();
 const server = createServer(app);
 
 // إعداد WebSocket للإشعارات المباشرة
 const wss = new WebSocketServer({ 
   server,
   path: '/ws'
 });
 
 // تخزين اتصالات WebSocket
 const connections = new Map();
 
 wss.on('connection', (ws, req) => {
   console.log('🔗 اتصال WebSocket جديد');
   
   ws.on('message', (message) => {
     try {
       const data = JSON.parse(message.toString());
       
       if (data.type === 'auth') {
         connections.set(data.userId, { ws, userType: data.userType });
         console.log(`✅ تم تسجيل المستخدم: ${data.userId} - ${data.userType}`);
         
         // إرسال تأكيد الاتصال
         ws.send(JSON.stringify({
           type: 'connected',
           message: 'تم الاتصال بنجاح'
         }));
       }
     } catch (error) {
       console.error('❌ خطأ في معالجة رسالة WebSocket:', error);
     }
   });
   
   ws.on('close', () => {
     // إزالة الاتصال عند الإغلاق
     for (const [userId, connection] of connections.entries()) {
       if (connection.ws === ws) {
         connections.delete(userId);
         console.log(`🔌 تم قطع الاتصال للمستخدم: ${userId}`);
         break;
       }
     }
   });
 
   ws.on('error', (error) => {
     console.error('❌ خطأ في WebSocket:', error);
   });
 });
 
 // دالة إرسال الإشعارات
 export function sendNotification(userId: string, notification: any) {
   const connection = connections.get(userId);
   if (connection && connection.ws.readyState === 1) {
     try {
       connection.ws.send(JSON.stringify({
         type: 'notification',
         data: notification
       }));
       console.log(`📨 تم إرسال إشعار للمستخدم: ${userId}`);
     } catch (error) {
       console.error('❌ خطأ في إرسال الإشعار:', error);
     }
   }
 }
 
 // دالة إرسال إشعار لجميع السائقين
 export function broadcastToDrivers(notification: any) {
   let sentCount = 0;
   for (const [userId, connection] of connections.entries()) {
     if (connection.userType === 'driver' && connection.ws.readyState === 1) {
       try {
         connection.ws.send(JSON.stringify({
           type: 'notification',
           data: notification
         }));
         sentCount++;
       } catch (error) {
         console.error(`❌ خطأ في إرسال إشعار للسائق ${userId}:`, error);
       }
     }
   }
   console.log(`📢 تم إرسال إشعار لـ ${sentCount} سائق`);
 }
 
 // دالة إرسال إشعار لجميع المديرين
 export function broadcastToAdmins(notification: any) {
   let sentCount = 0;
   for (const [userId, connection] of connections.entries()) {
     if (connection.userType === 'admin' && connection.ws.readyState === 1) {
       try {
         connection.ws.send(JSON.stringify({
           type: 'notification',
           data: notification
         }));
         sentCount++;
       } catch (error) {
         console.error(`❌ خطأ في إرسال إشعار للمدير ${userId}:`, error);
       }
     }
   }
   console.log(`📢 تم إرسال إشعار لـ ${sentCount} مدير`);
 }
 
-// إعداد الجلسات
-const PgSession = ConnectPgSimple(session);
-
-app.use(session({
-  store: new PgSession({
-    conString: process.env.DATABASE_URL,
-    tableName: 'session',
-    createTableIfMissing: true,
-  }),
-  secret: process.env.SESSION_SECRET || 'saree-one-secret-key-2024',
-  resave: false,
-  saveUninitialized: false,
-  cookie: {
-    secure: process.env.NODE_ENV === 'production',
-    httpOnly: true,
-    maxAge: 24 * 60 * 60 * 1000, // 24 ساعة
-  },
-}));
+// إعداد الجلسات (فقط إذا كانت قاعدة البيانات متاحة)
+if (process.env.DATABASE_URL) {
+  const PgSession = ConnectPgSimple(session);
+  
+  app.use(session({
+    store: new PgSession({
+      conString: process.env.DATABASE_URL,
+      tableName: 'session',
+      createTableIfMissing: true,
+    }),
+    secret: process.env.SESSION_SECRET || 'saree-one-secret-key-2024',
+    resave: false,
+    saveUninitialized: false,
+    cookie: {
+      secure: process.env.NODE_ENV === 'production',
+      httpOnly: true,
+      maxAge: 24 * 60 * 60 * 1000, // 24 ساعة
+    },
+  }));
+}
 
 // Middleware
 app.use(express.json({ limit: '10mb' }));
 app.use(express.urlencoded({ extended: true, limit: '10mb' }));
 
 // إعداد CORS
 app.use((req, res, next) => {
   const origin = req.headers.origin;
   const allowedOrigins = [
     'http://localhost:5000',
     'http://localhost:3000',
-    'https://c-digo-v24r.onrender.com',
-    process.env.VITE_APP_BASE_URL
+    'https://c-digo-.onrender.com',
+    process.env.RENDER_EXTERNAL_URL
   ].filter(Boolean);
 
-  if (allowedOrigins.includes(origin)) {
+  if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'production') {
     res.header('Access-Control-Allow-Origin', origin);
   }
   
   res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
   res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
   res.header('Access-Control-Allow-Credentials', 'true');
   
   if (req.method === 'OPTIONS') {
     res.sendStatus(200);
   } else {
     next();
   }
 });
 
 // Health check endpoint
 app.get('/health', (req, res) => {
   res.json({ 
     status: 'OK', 
     timestamp: new Date().toISOString(),
     connections: connections.size,
+    env: process.env.NODE_ENV
   });
 });
 
 // API Routes
 app.use('/api/admin', adminRoutes);
 app.use('/api/customer', customerRoutes);
 app.use('/api/driver', driverRoutes);
 app.use('/api', publicRoutes);
 
 // إعداد Vite أو الملفات الثابتة
 if (process.env.NODE_ENV === "development") {
   await setupVite(app);
 } else {
   serveStatic(app);
 }
 
 const PORT = process.env.PORT || 5000;
 
 server.listen(PORT, '0.0.0.0', () => {
   console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
   console.log(`📱 تطبيق العملاء: http://localhost:${PORT}`);
   console.log(`🏢 لوحة التحكم: http://localhost:${PORT}/admin`);
   console.log(`🚚 تطبيق السائقين: http://localhost:${PORT}/delivery`);
   console.log(`🌐 WebSocket: ws://localhost:${PORT}/ws`);
   
   if (process.env.NODE_ENV === 'production') {
-    console.log(`🌍 الرابط العام: ${process.env.VITE_APP_BASE_URL}`);
+    console.log(`🌍 الرابط العام: ${process.env.RENDER_EXTERNAL_URL}`);
   }
 });