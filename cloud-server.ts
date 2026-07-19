import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import { MongoClient, Db, Collection } from "mongodb";

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = "jgym";

let db: Db;
let membersCol: Collection;
let lockersCol: Collection;
let attendanceCol: Collection;
let transactionsCol: Collection;
let notificationsCol: Collection;
let lockerRequestsCol: Collection;
let messagesCol: Collection;
let settingsCol: Collection;
let transformationsCol: Collection;

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm: number, jd: number;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return [jy, jm, jd];
}

function todayJalali(): string {
  const now = new Date();
  const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

function timeNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

app.use(cors());

// Gzip compression middleware
app.use((req, res, next) => {
  const originalSend = res.send.bind(res);
  res.send = function (body: any) {
    if (typeof body === "string" && body.length > 1024 && !res.getHeader("Content-Encoding")) {
      const compressed = zlib.gzipSync(Buffer.from(body), { level: 6 });
      if (compressed.length < body.length * 0.9) {
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Length", compressed.length);
        return originalSend(compressed);
      }
    }
    return originalSend(body);
  } as any;
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// --- MongoDB ---
async function connectDB() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI not set! Falling back to local db.json");
    return false;
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  membersCol = db.collection("members");
  lockersCol = db.collection("lockers");
  attendanceCol = db.collection("attendance");
  transactionsCol = db.collection("transactions");
  notificationsCol = db.collection("notifications");
  lockerRequestsCol = db.collection("lockerRequests");
  messagesCol = db.collection("messages");
  settingsCol = db.collection("settings");
  transformationsCol = db.collection("transformations");
  console.log("Connected to MongoDB Atlas");
  return true;
}

async function seedDB() {
  // Full reset: drop all lockers, re-insert exactly 24 clean ones
  await lockersCol.deleteMany({});
  const defaultLockers = Array.from({ length: 24 }, (_, i) => ({
    id: i + 1, status: "empty", memberId: null, memberName: null,
    memberPhoto: null, membershipId: null, checkInTime: null,
    reservationNote: null, isDoorOpen: false
  }));
  await lockersCol.insertMany(defaultLockers);

  const count = await lockersCol.countDocuments();
  console.log(`Lockers reset: ${count} lockers in database`);

  const settingsCount = await settingsCol.countDocuments();
  if (settingsCount === 0) {
    await settingsCol.insertOne({
      coachName: "جابر پورعباس",
      coachPhone: "09112223344",
      adminUsername: "jgym",
      adminPassword: "Jgym123321"
    });
    console.log("Default settings created");
  }
}

function emit(event: string, payload?: any) {
  if (io) io.emit(event, { ...payload, timestamp: Date.now() });
}

// --- HTTP Server + Socket.io ---
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

// --- API Routes ---

// Auth
app.post("/api/auth/login", async (req, res) => {
  const { role, phone, password, username } = req.body;
  if (role === "admin") {
    const settings = await settingsCol.findOne({});
    if (username === (settings?.adminUsername || "jgym") && password === (settings?.adminPassword || "Jgym123321")) {
      return res.json({ success: true, token: "admin-jwt", user: { name: settings?.coachName || "جابر پورعباس", role: "admin" } });
    }
    return res.status(401).json({ success: false, message: "نام کاربری یا رمز عبور اشتباه است." });
  }
  if (role === "member") {
    const member = await membersCol.findOne({ phone });
    if (member && password === (member.password || member.phone)) {
      return res.json({ success: true, token: `member-${member.id}`, user: { ...member, role: "member" } });
    }
    return res.status(401).json({ success: false, message: "شماره یا رمز عبور اشتباه است." });
  }
  return res.status(400).json({ success: false, message: "نوع ورود نامعتبر است." });
});

// Settings
function stripHeavyData(doc: any) {
  if (!doc) return doc;
  const clean = { ...doc };
  delete clean.coachGallery;
  delete clean.coachAchievements;
  return clean;
}
app.get("/api/settings", async (req, res) => {
  const settings = await settingsCol.findOne({});
  res.json(stripHeavyData(settings) || {});
});
app.get("/api/settings/full", async (req, res) => {
  const settings = await settingsCol.findOne({});
  res.json(settings || {});
});
app.get("/api/settings/gallery", async (req, res) => {
  const settings = await settingsCol.findOne({}, { projection: { coachGallery: 1, coachAchievements: 1, _id: 0 } });
  res.json({ coachGallery: settings?.coachGallery || [], coachAchievements: settings?.coachAchievements || [] });
});
app.post("/api/settings", async (req, res) => {
  await settingsCol.updateOne({}, { $set: req.body }, { upsert: true });
  const settings = await settingsCol.findOne({});
  res.json({ success: true, settings });
});

// Members
function stripMemberHeavy(m: any) {
  if (!m) return m;
  const clean = { ...m };
  if (clean.avatar && clean.avatar.startsWith("data:")) {
    clean.avatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=250&auto=format&fit=crop";
  }
  return clean;
}
app.get("/api/members", async (req, res) => {
  const members = await membersCol.find({}).toArray();
  res.json(members.map(stripMemberHeavy));
});

app.post("/api/members", async (req, res) => {
  const { name, phone, gender, joinDate, endDate, feeStatus, totalFee, paidFee, avatar, nationalCode, birthDate, height, targetWeight, bodyFat, muscleMass, address, password } = req.body;

  // Duplicate check
  const existingPhone = await membersCol.findOne({ phone });
  if (existingPhone) {
    return res.status(409).json({ success: false, message: "شماره موبایل قبلاً ثبت شده است. امکان ثبت نام تکراری وجود ندارد." });
  }
  const existingName = await membersCol.findOne({ name });
  if (existingName) {
    return res.status(409).json({ success: false, message: "نام و نام خانوادگی قبلاً ثبت شده است. امکان ثبت نام تکراری وجود ندارد." });
  }

  const count = await membersCol.countDocuments();
  const membershipId = `JG-${100 + count + 1}`;
  const newMember = {
    id: `mem_${Date.now()}`, name, phone, gender, joinDate, endDate,
    membershipStatus: "active",
    feeStatus: paidFee >= totalFee ? "settled" : (paidFee === 0 ? "debtor" : "partial"),
    totalFee: Number(totalFee), paidFee: Number(paidFee),
    avatar: avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=250&auto=format&fit=crop",
    membershipId, weightHistory: [{ date: joinDate, weight: 80 }],
    password: password || phone,
    workoutPlan: null, dietPlan: null, isPresent: false, currentLockerId: null,
    nationalCode, birthDate, height: height ? Number(height) : undefined,
    targetWeight: targetWeight ? Number(targetWeight) : undefined,
    bodyFat: bodyFat ? Number(bodyFat) : undefined,
    muscleMass: muscleMass ? Number(muscleMass) : undefined, address
  };
  await membersCol.insertOne(newMember);
  if (paidFee > 0) {
    await transactionsCol.insertOne({ id: `tx_${Date.now()}`, type: "membership", amount: Number(paidFee), description: `ثبت نام ${name}`, date: joinDate || todayJalali() });
  }
  emit("member:created", { member: newMember });
  res.status(201).json(newMember);
});

app.put("/api/members/:id", async (req, res) => {
  const member = await membersCol.findOne({ id: req.params.id });
  if (!member) return res.status(404).json({ message: "Member not found" });
  await membersCol.updateOne({ id: req.params.id }, { $set: req.body });
  if (req.body.name || req.body.avatar) {
    await lockersCol.updateMany({ memberId: req.params.id }, { $set: { memberName: req.body.name || member.name, memberPhoto: req.body.avatar || member.avatar } });
  }
  const updated = await membersCol.findOne({ id: req.params.id });
  emit("member:updated", { member: updated });
  res.json(updated);
});

app.delete("/api/members/:id", async (req, res) => {
  const member = await membersCol.findOne({ id: req.params.id });
  if (!member) return res.status(404).json({ message: "Member not found" });
  if (member.currentLockerId) {
    await lockersCol.updateOne({ id: member.currentLockerId }, { $set: { status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false } });
  }
  await membersCol.deleteOne({ id: req.params.id });
  emit("member:deleted", { memberId: req.params.id });
  res.json({ success: true });
});

app.post("/api/members/:id/weight", async (req, res) => {
  const member = await membersCol.findOne({ id: req.params.id });
  if (!member) return res.status(404).json({ message: "Member not found" });
  const history = member.weightHistory || [];
  history.push({ date: req.body.date, weight: Number(req.body.weight) });
  await membersCol.updateOne({ id: req.params.id }, { $set: { weightHistory: history } });
  const updated = await membersCol.findOne({ id: req.params.id });
  res.json(updated);
});

app.post("/api/members/:id/checkin", async (req, res) => {
  const member = await membersCol.findOne({ id: req.params.id });
  if (!member) return res.status(404).json({ message: "عضو یافت نشد." });
  if (member.isPresent) return res.status(400).json({ message: "این عضو قبلاً وارد شده." });
  let lockerId = req.body.lockerId;
  if (!lockerId) {
    const empty = await lockersCol.findOne({ status: "empty" });
    if (!empty) return res.status(400).json({ message: "کمد خالی وجود ندارد." });
    lockerId = empty.id;
  }
  const locker = await lockersCol.findOne({ id: Number(lockerId) });
  if (!locker || locker.status !== "empty") return res.status(400).json({ message: "کمد در دسترس نیست." });
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  let status: string = "active";
  if (member.feeStatus === "debtor") status = "debtor";
  else if (member.membershipStatus === "expiring") status = "expiring";
  await lockersCol.updateOne({ id: Number(lockerId) }, { $set: { status, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, checkInTime: timeStr, reservationNote: null, isDoorOpen: false } });
  await membersCol.updateOne({ id: req.params.id }, { $set: { isPresent: true, currentLockerId: Number(lockerId) } });
  await attendanceCol.insertOne({ id: `att_${Date.now()}`, memberId: member.id, memberName: member.name, lockerId: Number(lockerId), checkIn: `${todayJalali()} ${timeStr}`, checkOut: null });
  const updatedMember = await membersCol.findOne({ id: req.params.id });
  const updatedLocker = await lockersCol.findOne({ id: Number(lockerId) });
  emit("member:checkedin", { member: updatedMember, locker: updatedLocker });
  res.json({ success: true, member: updatedMember, locker: updatedLocker });
});

app.post("/api/members/:id/checkout", async (req, res) => {
  const member = await membersCol.findOne({ id: req.params.id });
  if (!member) return res.status(404).json({ message: "عضو یافت نشد." });
  if (!member.isPresent || !member.currentLockerId) return res.status(400).json({ message: "عضو حضور ندارد." });
  const lockerId = member.currentLockerId;
  await lockersCol.updateOne({ id: lockerId }, { $set: { status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false } });
  await membersCol.updateOne({ id: req.params.id }, { $set: { isPresent: false, currentLockerId: null } });
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  await attendanceCol.updateOne({ memberId: member.id, checkOut: null }, { $set: { checkOut: `${todayJalali()} ${timeStr}` } });
  const updatedMember = await membersCol.findOne({ id: req.params.id });
  emit("member:checkedout", { member: updatedMember });
  res.json({ success: true, member: updatedMember });
});

app.post("/api/members/:id/pay-tuition", async (req, res) => {
  const member = await membersCol.findOne({ id: req.params.id });
  if (!member) return res.status(404).json({ success: false, message: "عضو یافت نشد." });
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "مبلغ نامعتبر." });
  const newPaid = member.paidFee + amount;
  let feeStatus = member.feeStatus;
  let membershipStatus = member.membershipStatus;
  if (newPaid >= member.totalFee) { feeStatus = "settled"; if (membershipStatus === "debtor") membershipStatus = "active"; }
  else if (newPaid > 0) feeStatus = "partial";
  await membersCol.updateOne({ id: req.params.id }, { $set: { paidFee: newPaid, feeStatus, membershipStatus } });
  if (member.currentLockerId && feeStatus === "settled") {
    await lockersCol.updateOne({ id: member.currentLockerId, status: "debtor" }, { $set: { status: "active" } });
  }
  const now = new Date();
  await transactionsCol.insertOne({ id: `tx_${Date.now()}`, type: "membership", amount, description: `پرداخت شهریه ${member.name}`, date: req.body.date || todayJalali() });
  await notificationsCol.insertOne({ id: `notif_${Date.now()}`, title: `پرداخت شهریه: ${member.name}`, message: `${member.name} مبلغ ${amount.toLocaleString("fa-IR")} تومان پرداخت کرد.`, date: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, isRead: false });
  const updatedMember = await membersCol.findOne({ id: req.params.id });
  emit("payment:received", { member: updatedMember, amount });
  res.status(200).json({ success: true, member: updatedMember });
});

// Lockers
app.get("/api/lockers", async (req, res) => {
  const lockers = await lockersCol.find({}).sort({ id: 1 }).toArray();
  res.json(lockers);
});

app.post("/api/lockers/:id/reserve", async (req, res) => {
  const id = Number(req.params.id);
  const locker = await lockersCol.findOne({ id });
  if (!locker) return res.status(404).json({ message: "کمد یافت نشد." });
  if (locker.status !== "empty") return res.status(400).json({ message: "کمد خالی نیست." });
  const { memberName, note, memberId } = req.body;
  let mId: string | null = null, mName = memberName || "رزرو شده", mPhoto: string | null = null, mshipId: string | null = null;
  if (memberId) { const m = await membersCol.findOne({ id: memberId }); if (m) { mId = m.id; mName = m.name; mPhoto = m.avatar; mshipId = m.membershipId; } }
  const reserved = { id, status: "reserved", memberId: mId, memberName: mName, memberPhoto: mPhoto, membershipId: mshipId, checkInTime: null, reservationNote: note || "بدون جزئیات", isDoorOpen: false };
  await lockersCol.updateOne({ id }, { $set: reserved });
  emit("locker:updated", { locker: reserved });
  res.json(reserved);
});

app.post("/api/lockers/:id/release", async (req, res) => {
  const id = Number(req.params.id);
  const locker = await lockersCol.findOne({ id });
  if (!locker) return res.status(404).json({ message: "کمد یافت نشد." });
  if (locker.memberId) {
    await membersCol.updateOne({ id: locker.memberId }, { $set: { isPresent: false, currentLockerId: null } });
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    await attendanceCol.updateOne({ memberId: locker.memberId, checkOut: null }, { $set: { checkOut: `${todayJalali()} ${timeStr}` } });
  }
  const empty = { id, status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false };
  await lockersCol.updateOne({ id }, { $set: empty });
  emit("locker:updated", { locker: empty });
  res.json(empty);
});

app.post("/api/lockers/:id/toggle-door", async (req, res) => {
  const id = Number(req.params.id);
  const locker = await lockersCol.findOne({ id });
  if (!locker) return res.status(404).json({ message: "کمد یافت نشد." });
  const newOpen = !locker.isDoorOpen;
  await lockersCol.updateOne({ id }, { $set: { isDoorOpen: newOpen } });
  if (newOpen && locker.memberId) {
    const now = new Date();
    await notificationsCol.insertOne({ id: `notif_${Date.now()}`, title: `هشدار: درب باز کمد ${id}`, message: `درب کمد ${id} متعلق به ${locker.memberName} باز است.`, date: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, isRead: false });
  }
  const updated = await lockersCol.findOne({ id });
  emit("locker:updated", { locker: updated });
  res.json(updated);
});

app.post("/api/lockers/move", async (req, res) => {
  const srcId = Number(req.body.sourceLockerId);
  const tgtId = Number(req.body.targetLockerId);
  const src = await lockersCol.findOne({ id: srcId });
  const tgt = await lockersCol.findOne({ id: tgtId });
  if (!src || !tgt) return res.status(404).json({ message: "کمد یافت نشد." });
  if (src.status === "empty") return res.status(400).json({ message: "کمد مبدأ خالی است." });
  if (tgt.status !== "empty") return res.status(400).json({ message: "کمد مقصد پر است." });
  const { _id, ...srcData } = src as any;
  await lockersCol.updateOne({ id: tgtId }, { $set: { ...srcData, id: tgtId } });
  if (src.memberId) {
    await membersCol.updateOne({ id: src.memberId }, { $set: { currentLockerId: tgtId } });
  }
  await lockersCol.updateOne({ id: srcId }, { $set: { id: srcId, status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false } });
  const allLockers = await lockersCol.find({}).sort({ id: 1 }).toArray();
  emit("locker:moved", { lockers: allLockers });
  res.json({ success: true, lockers: allLockers });
});

app.post("/api/lockers/:id/guest-reserve", async (req, res) => {
  const id = Number(req.params.id);
  const { guestName, guestPhone, gender } = req.body;
  if (!guestName || !guestPhone) return res.status(400).json({ success: false, message: "اطلاعات ناقص." });
  const locker = await lockersCol.findOne({ id });
  if (!locker || locker.status !== "empty") return res.status(400).json({ success: false, message: "کمد در دسترس نیست." });
  const guestId = `guest_${Date.now()}`;
  const memberCount = await membersCol.countDocuments();
  const membershipId = `GUEST-${1000 + memberCount + 1}`;
  const guestAvatar = gender === "female" ? "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150" : "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150";
  await membersCol.insertOne({ id: guestId, name: guestName, phone: guestPhone, gender: gender || "male", joinDate: todayJalali(), endDate: todayJalali(), membershipStatus: "active", feeStatus: "settled", totalFee: 100000, paidFee: 50000, avatar: guestAvatar, membershipId, weightHistory: [], workoutPlan: null, dietPlan: null, isPresent: false, currentLockerId: null });
  await lockersCol.updateOne({ id }, { $set: { status: "reserved", memberId: guestId, memberName: guestName, memberPhoto: guestAvatar, membershipId, checkInTime: null, reservationNote: "رزرو مهمان", isDoorOpen: false } });
  await lockerRequestsCol.insertOne({ id: `req_${Date.now()}`, memberId: guestId, memberName: guestName, memberPhoto: guestAvatar, membershipId, type: "allocation", status: "pending", date: todayJalali(), time: "17:00", lockerId: id });
  await transactionsCol.insertOne({ id: `tx_${Date.now()}`, type: "membership", amount: 50000, description: `رزرو مهمان ${guestName}`, date: todayJalali() });
  const updated = await lockersCol.findOne({ id });
  res.status(200).json({ success: true, locker: updated });
});

app.post("/api/lockers/:id/member-reserve", async (req, res) => {
  const id = Number(req.params.id);
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ success: false, message: "شناسه عضو نیست." });
  const member = await membersCol.findOne({ id: memberId });
  if (!member) return res.status(404).json({ success: false, message: "عضو یافت نشد." });
  if (member.isPresent || member.currentLockerId) return res.status(400).json({ success: false, message: "شما حضور دارید." });
  const locker = await lockersCol.findOne({ id });
  if (!locker || locker.status !== "empty") return res.status(400).json({ success: false, message: "کمد در دسترس نیست." });
  await lockersCol.updateOne({ id }, { $set: { status: "reserved", memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, checkInTime: null, reservationNote: "رزرو آنلاین", isDoorOpen: false } });
  await lockerRequestsCol.insertOne({ id: `req_${Date.now()}`, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, type: "allocation", status: "pending", date: todayJalali(), time: "17:00", lockerId: id });
  const updated = await lockersCol.findOne({ id });
  res.status(200).json({ success: true, locker: updated });
});

// Locker Requests
app.get("/api/locker-requests", async (req, res) => {
  const requests = await lockerRequestsCol.find({}).toArray();
  res.json(requests);
});

app.post("/api/locker-requests/:id/approve", async (req, res) => {
  const request = await lockerRequestsCol.findOne({ id: req.params.id });
  if (!request) return res.status(404).json({ success: false, message: "درخواست یافت نشد." });
  if (request.status !== "pending") return res.status(400).json({ success: false, message: "درخواست قبلاً بررسی شده." });
  const member = await membersCol.findOne({ id: request.memberId });
  if (!member) return res.status(404).json({ success: false, message: "عضو یافت نشد." });
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (request.type === "allocation") {
    let lockerId = req.body.lockerId;
    let assigned;
    if (lockerId) assigned = await lockersCol.findOne({ id: Number(lockerId), status: { $in: ["empty", "reserved"] } });
    else assigned = await lockersCol.findOne({ status: "empty" });
    if (!assigned) return res.status(400).json({ success: false, message: "کمد خالی نیست." });
    let status = "active";
    if (member.feeStatus === "debtor") status = "debtor";
    else if (member.membershipStatus === "expiring") status = "expiring";
    await lockersCol.updateOne({ id: assigned.id }, { $set: { status, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, checkInTime: timeStr, reservationNote: null, isDoorOpen: false } });
    await membersCol.updateOne({ id: member.id }, { $set: { isPresent: true, currentLockerId: assigned.id } });
    await attendanceCol.insertOne({ id: `att_${Date.now()}`, memberId: member.id, memberName: member.name, lockerId: assigned.id, checkIn: `${todayJalali()} ${timeStr}`, checkOut: null });
    await lockerRequestsCol.updateOne({ id: request.id }, { $set: { status: "approved", lockerId: assigned.id } });
  } else if (request.type === "checkout") {
    if (!member.isPresent || !member.currentLockerId) return res.status(400).json({ success: false, message: "عضو حضور ندارد." });
    const lockerId = member.currentLockerId;
    await lockersCol.updateOne({ id: lockerId }, { $set: { status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false } });
    await membersCol.updateOne({ id: member.id }, { $set: { isPresent: false, currentLockerId: null } });
    await attendanceCol.updateOne({ memberId: member.id, checkOut: null }, { $set: { checkOut: `${todayJalali()} ${timeStr}` } });
    await lockerRequestsCol.updateOne({ id: request.id }, { $set: { status: "approved" } });
  }
  const updated = await lockerRequestsCol.findOne({ id: request.id });
  res.json({ success: true, request: updated });
});

app.post("/api/locker-requests/:id/reject", async (req, res) => {
  const request = await lockerRequestsCol.findOne({ id: req.params.id });
  if (!request) return res.status(404).json({ success: false, message: "درخواست یافت نشد." });
  await lockerRequestsCol.updateOne({ id: request.id }, { $set: { status: "rejected" } });
  const updated = await lockerRequestsCol.findOne({ id: request.id });
  res.json({ success: true, request: updated });
});

app.post("/api/locker-requests", async (req, res) => {
  const { memberId, type } = req.body;
  if (!memberId || !type) return res.status(400).json({ success: false, message: "اطلاعات ناقص." });
  const member = await membersCol.findOne({ id: memberId });
  if (!member) return res.status(404).json({ success: false, message: "عضو یافت نشد." });
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const newReq = { id: `req_${Date.now()}`, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, type, status: "pending", date: todayJalali(), time: timeStr, lockerId: type === "checkout" ? member.currentLockerId : null };
  await lockerRequestsCol.insertOne(newReq);
  await notificationsCol.insertOne({ id: `notif_${Date.now()}`, title: type === "allocation" ? `درخواست کمد: ${member.name}` : `درخواست تخلیه: ${member.name}`, message: `${member.name} درخواست ${type === "allocation" ? "کمد جدید" : "تخلیه"} داده.`, date: timeStr, isRead: false });
  res.status(201).json({ success: true, request: newReq });
});

// Stats
app.get("/api/stats", async (req, res) => {
  const allMembers = await membersCol.find({}).toArray();
  const allAttendance = await attendanceCol.find({}).toArray();
  const allTransactions = await transactionsCol.find({}).toArray();
  const totalMembers = allMembers.length;
  const presentMembers = allMembers.filter((m: any) => m.isPresent).length;
  const leftMembersToday = allAttendance.filter((a: any) => a.checkOut !== null).length;
  const todayIncome = allTransactions.reduce((acc: number, cur: any) => acc + (cur.amount || 0), 0);
  const monthIncome = todayIncome + 14800000;
  const debtorCount = allMembers.filter((m: any) => m.feeStatus === "debtor" || m.feeStatus === "partial").length;
  const expiringSoonCount = allMembers.filter((m: any) => m.membershipStatus === "expiring").length;
  const buffetSales = allTransactions.filter((tx: any) => tx.type === "buffet").reduce((acc: number, cur: any) => acc + (cur.amount || 0), 0);
  const storeSales = allTransactions.filter((tx: any) => tx.type === "store").reduce((acc: number, cur: any) => acc + (cur.amount || 0), 0);
  res.json({ totalMembers, presentMembers, leftMembersToday, todayIncome, monthIncome, debtorCount, expiringSoonCount, buffetSales, storeSales });
});

// Transactions, Attendance, Notifications
app.get("/api/transactions", async (req, res) => { res.json(await transactionsCol.find({}).toArray()); });
app.get("/api/attendance", async (req, res) => { res.json(await attendanceCol.find({}).toArray()); });
app.get("/api/notifications", async (req, res) => { res.json(await notificationsCol.find({}).toArray()); });
app.post("/api/notifications/read", async (req, res) => {
  await notificationsCol.updateOne({ id: req.body.id }, { $set: { isRead: true } });
  res.json({ success: true });
});

// Sales
app.post("/api/sales", async (req, res) => {
  const tx = { id: `tx_${Date.now()}`, type: req.body.type, amount: Number(req.body.amount), description: req.body.description, date: todayJalali() };
  await transactionsCol.insertOne(tx);
  res.status(201).json(tx);
});

// Messages
app.get("/api/messages", async (req, res) => {
  const { memberId } = req.query;
  let filter: any = {};
  if (memberId) {
    filter = { memberId, type: { $ne: "forgot-password" } };
  }
  res.json(await messagesCol.find(filter).toArray());
});
app.post("/api/messages", async (req, res) => {
  const { memberId, memberName, text, sender } = req.body;
  if (!memberId || !text || !sender) return res.status(400).json({ success: false, message: "ناقص." });
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const msg = { id: `msg_${Date.now()}`, memberId, memberName: memberName || "ورزشکار", text, sender, date: todayJalali(), time: timeStr, isRead: false };
  await messagesCol.insertOne(msg);
  emit("message:new", { message: msg });
  res.json({ success: true, message: msg });
});
app.post("/api/messages/:id/reply", async (req, res) => {
  const msg = await messagesCol.findOne({ id: req.params.id });
  if (!msg) return res.status(404).json({ success: false, message: "پیام یافت نشد." });
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  await messagesCol.updateOne({ id: req.params.id }, { $set: { replyText: req.body.replyText, replyDate: todayJalali(), replyTime: timeStr, isReplied: true, isRead: true } });
  const updated = await messagesCol.findOne({ id: req.params.id });
  res.json({ success: true, message: updated });
});

// Transformations
app.get("/api/transformations", async (req, res) => {
  if (req.query.publicOnly === "true") return res.json(await transformationsCol.find({ isPublic: true }).toArray());
  res.json(await transformationsCol.find({}).toArray());
});
app.post("/api/transformations", async (req, res) => {
  const t = { id: `trans_${Date.now()}`, ...req.body, date: todayJalali(), consentGranted: !!req.body.consentGranted, isPublic: !!req.body.isPublic };
  await transformationsCol.insertOne(t);
  res.status(201).json({ success: true, transformation: t });
});
app.put("/api/transformations/:id", async (req, res) => {
  const t = await transformationsCol.findOne({ id: req.params.id });
  if (!t) return res.status(404).json({ success: false, message: "یافت نشد." });
  await transformationsCol.updateOne({ id: req.params.id }, { $set: req.body });
  const updated = await transformationsCol.findOne({ id: req.params.id });
  res.json({ success: true, transformation: updated });
});
app.delete("/api/transformations/:id", async (req, res) => {
  const t = await transformationsCol.findOne({ id: req.params.id });
  if (!t) return res.status(404).json({ success: false, message: "یافت نشد." });
  await transformationsCol.deleteOne({ id: req.params.id });
  res.json({ success: true });
});

// Zarinpal stub
app.post("/api/payment/zarinpal/initiate", (req, res) => {
  res.json({ success: true, redirectUrl: "#", authority: "CLOUD_SIM", simulated: true, message: "پرداخت ابری شبیه‌سازی شد." });
});

// Forgot Password - Member sends recovery request to admin
app.post("/api/forgot-password", async (req, res) => {
  const { phone, name } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: "شماره موبایل الزامی است." });
  const member = await membersCol.findOne({ phone });
  const memberName = member ? member.name : (name || "ناشناس");
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const msg = {
    id: `msg_forgotpw_${Date.now()}`,
    memberId: member ? member.id : "unknown",
    memberName,
    text: `درخواست بازیابی رمز عبور از سمت ${memberName} (شماره: ${phone}). لطفاً رمز جدید را برای این عضو تنظیم کنید.`,
    sender: "member",
    date: todayJalali(),
    time: timeStr,
    isRead: false,
    type: "forgot-password"
  };
  await messagesCol.insertOne(msg);
  await notificationsCol.insertOne({
    id: `notif_${Date.now()}`,
    title: `درخواست بازیابی رمز: ${memberName}`,
    message: `${memberName} (شماره: ${phone}) درخواست بازیابی رمز عبور داده.`,
    date: timeStr,
    isRead: false
  });
  emit("message:new", { message: msg });
  res.json({ success: true, message: "درخواست بازیابی رمز عبور شما برای مدیر باشگاه ارسال شد. لطفاً منتظر پاسخ بمانید." });
});

// Health check
app.get("/api/health", (req, res) => { res.json({ status: "ok", timestamp: Date.now(), db: MONGODB_URI ? "mongodb" : "file" }); });

// Admin-only: cleanup duplicate lockers (temporary endpoint)
app.post("/api/admin/cleanup-lockers", async (req, res) => {
  const { username, password } = req.body;
  const settings = await settingsCol.findOne({});
  if (username !== (settings?.adminUsername || "jgym") || password !== (settings?.adminPassword || "Jgym123321")) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  // Nuclear approach: delete ALL lockers, re-insert exactly 24
  await lockersCol.deleteMany({});
  const defaultLockers = Array.from({ length: 24 }, (_, i) => ({
    id: i + 1, status: "empty", memberId: null, memberName: null,
    memberPhoto: null, membershipId: null, checkInTime: null,
    reservationNote: null, isDoorOpen: false
  }));
  await lockersCol.insertMany(defaultLockers);
  const finalCount = await lockersCol.countDocuments();
  res.json({ success: true, lockerCount: finalCount });
});

// Keep-alive ping for Render free tier (prevents sleeping)
if (process.env.RENDER_EXTERNAL_URL) {
  const keepAliveUrl = process.env.RENDER_EXTERNAL_URL;
  setInterval(async () => {
    try {
      await fetch(keepAliveUrl);
      console.log("Keep-alive ping sent");
    } catch (e) { /* ignore */ }
  }, 14 * 60 * 1000); // every 14 minutes
  console.log(`Keep-alive enabled for ${keepAliveUrl}`);
}

// Serve frontend static files
const distPath = path.join(process.cwd(), "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api/")) {
      res.sendFile(path.join(distPath, "index.html"));
    }
  });
  console.log("Serving static frontend from dist/");
}

// Start
(async () => {
  const connected = await connectDB();
  if (connected) {
    await seedDB();
  } else {
    console.log("No MongoDB URI - running without database");
  }
  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`J,Gym Cloud Server running on port ${PORT} (DB: ${connected ? "mongodb" : "none"})`);
  });
})();
