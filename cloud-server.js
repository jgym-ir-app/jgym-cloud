var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// cloud-server.ts
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_socket = require("socket.io");
var import_cors = __toESM(require("cors"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_mongodb = require("mongodb");
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
var app = (0, import_express.default)();
var PORT = process.env.PORT || 3e3;
var MONGODB_URI = process.env.MONGODB_URI || "";
var DB_NAME = "jgym";
var db;
var membersCol;
var lockersCol;
var attendanceCol;
var transactionsCol;
var notificationsCol;
var lockerRequestsCol;
var messagesCol;
var settingsCol;
var transformationsCol;
app.use((0, import_cors.default)());
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
async function connectDB() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI not set! Falling back to local db.json");
    return false;
  }
  const client = new import_mongodb.MongoClient(MONGODB_URI);
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
  const count = await membersCol.countDocuments();
  if (count > 0) return;
  const defaultLockers = Array.from({ length: 24 }, (_, i) => ({
    id: i + 1,
    status: "empty",
    memberId: null,
    memberName: null,
    memberPhoto: null,
    membershipId: null,
    checkInTime: null,
    reservationNote: null,
    isDoorOpen: false
  }));
  await lockersCol.insertMany(defaultLockers);
  await settingsCol.insertOne({
    coachName: "\u062C\u0627\u0628\u0631 \u067E\u0648\u0631\u0639\u0628\u0627\u0633",
    coachPhone: "09112223344",
    adminUsername: "jgym",
    adminPassword: "Jgym123321"
  });
  console.log("Database seeded with defaults");
}
function emit(event, payload) {
  if (io) io.emit(event, { ...payload, timestamp: Date.now() });
}
var httpServer = import_http.default.createServer(app);
var io = new import_socket.Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});
app.post("/api/auth/login", async (req, res) => {
  const { role, phone, password, username } = req.body;
  if (role === "admin") {
    const settings = await settingsCol.findOne({});
    if (username === (settings?.adminUsername || "jgym") && password === (settings?.adminPassword || "Jgym123321")) {
      return res.json({ success: true, token: "admin-jwt", user: { name: settings?.coachName || "\u062C\u0627\u0628\u0631 \u067E\u0648\u0631\u0639\u0628\u0627\u0633", role: "admin" } });
    }
    return res.status(401).json({ success: false, message: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A." });
  }
  if (role === "member") {
    const member = await membersCol.findOne({ phone });
    if (member && password === (member.password || member.phone)) {
      return res.json({ success: true, token: `member-${member.id}`, user: { ...member, role: "member" } });
    }
    return res.status(401).json({ success: false, message: "\u0634\u0645\u0627\u0631\u0647 \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A." });
  }
  return res.status(400).json({ success: false, message: "\u0646\u0648\u0639 \u0648\u0631\u0648\u062F \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." });
});
app.get("/api/settings", async (req, res) => {
  const settings = await settingsCol.findOne({});
  res.json(settings || {});
});
app.post("/api/settings", async (req, res) => {
  await settingsCol.updateOne({}, { $set: req.body }, { upsert: true });
  const settings = await settingsCol.findOne({});
  res.json({ success: true, settings });
});
app.get("/api/members", async (req, res) => {
  const members = await membersCol.find({}).toArray();
  res.json(members);
});
app.post("/api/members", async (req, res) => {
  const { name, phone, gender, joinDate, endDate, feeStatus, totalFee, paidFee, avatar, nationalCode, birthDate, height, targetWeight, bodyFat, muscleMass, address, password } = req.body;
  const count = await membersCol.countDocuments();
  const membershipId = `JG-${100 + count + 1}`;
  const newMember = {
    id: `mem_${Date.now()}`,
    name,
    phone,
    gender,
    joinDate,
    endDate,
    membershipStatus: "active",
    feeStatus: paidFee >= totalFee ? "settled" : paidFee === 0 ? "debtor" : "partial",
    totalFee: Number(totalFee),
    paidFee: Number(paidFee),
    avatar: avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=250&auto=format&fit=crop",
    membershipId,
    weightHistory: [{ date: joinDate, weight: 80 }],
    password: password || phone,
    workoutPlan: null,
    dietPlan: null,
    isPresent: false,
    currentLockerId: null,
    nationalCode,
    birthDate,
    height: height ? Number(height) : void 0,
    targetWeight: targetWeight ? Number(targetWeight) : void 0,
    bodyFat: bodyFat ? Number(bodyFat) : void 0,
    muscleMass: muscleMass ? Number(muscleMass) : void 0,
    address
  };
  await membersCol.insertOne(newMember);
  if (paidFee > 0) {
    await transactionsCol.insertOne({ id: `tx_${Date.now()}`, type: "membership", amount: Number(paidFee), description: `\u062B\u0628\u062A \u0646\u0627\u0645 ${name}`, date: joinDate || "1405/04/10" });
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
  if (!member) return res.status(404).json({ message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  if (member.isPresent) return res.status(400).json({ message: "\u0627\u06CC\u0646 \u0639\u0636\u0648 \u0642\u0628\u0644\u0627\u064B \u0648\u0627\u0631\u062F \u0634\u062F\u0647." });
  let lockerId = req.body.lockerId;
  if (!lockerId) {
    const empty = await lockersCol.findOne({ status: "empty" });
    if (!empty) return res.status(400).json({ message: "\u06A9\u0645\u062F \u062E\u0627\u0644\u06CC \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F." });
    lockerId = empty.id;
  }
  const locker = await lockersCol.findOne({ id: Number(lockerId) });
  if (!locker || locker.status !== "empty") return res.status(400).json({ message: "\u06A9\u0645\u062F \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A." });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  let status = "active";
  if (member.feeStatus === "debtor") status = "debtor";
  else if (member.membershipStatus === "expiring") status = "expiring";
  await lockersCol.updateOne({ id: Number(lockerId) }, { $set: { status, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, checkInTime: timeStr, reservationNote: null, isDoorOpen: false } });
  await membersCol.updateOne({ id: req.params.id }, { $set: { isPresent: true, currentLockerId: Number(lockerId) } });
  await attendanceCol.insertOne({ id: `att_${Date.now()}`, memberId: member.id, memberName: member.name, lockerId: Number(lockerId), checkIn: `1405/04/10 ${timeStr}`, checkOut: null });
  const updatedMember = await membersCol.findOne({ id: req.params.id });
  const updatedLocker = await lockersCol.findOne({ id: Number(lockerId) });
  emit("member:checkedin", { member: updatedMember, locker: updatedLocker });
  res.json({ success: true, member: updatedMember, locker: updatedLocker });
});
app.post("/api/members/:id/checkout", async (req, res) => {
  const member = await membersCol.findOne({ id: req.params.id });
  if (!member) return res.status(404).json({ message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  if (!member.isPresent || !member.currentLockerId) return res.status(400).json({ message: "\u0639\u0636\u0648 \u062D\u0636\u0648\u0631 \u0646\u062F\u0627\u0631\u062F." });
  const lockerId = member.currentLockerId;
  await lockersCol.updateOne({ id: lockerId }, { $set: { status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false } });
  await membersCol.updateOne({ id: req.params.id }, { $set: { isPresent: false, currentLockerId: null } });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  await attendanceCol.updateOne({ memberId: member.id, checkOut: null }, { $set: { checkOut: `1405/04/10 ${timeStr}` } });
  const updatedMember = await membersCol.findOne({ id: req.params.id });
  emit("member:checkedout", { member: updatedMember });
  res.json({ success: true, member: updatedMember });
});
app.post("/api/members/:id/pay-tuition", async (req, res) => {
  const member = await membersCol.findOne({ id: req.params.id });
  if (!member) return res.status(404).json({ success: false, message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "\u0645\u0628\u0644\u063A \u0646\u0627\u0645\u0639\u062A\u0628\u0631." });
  const newPaid = member.paidFee + amount;
  let feeStatus = member.feeStatus;
  let membershipStatus = member.membershipStatus;
  if (newPaid >= member.totalFee) {
    feeStatus = "settled";
    if (membershipStatus === "debtor") membershipStatus = "active";
  } else if (newPaid > 0) feeStatus = "partial";
  await membersCol.updateOne({ id: req.params.id }, { $set: { paidFee: newPaid, feeStatus, membershipStatus } });
  if (member.currentLockerId && feeStatus === "settled") {
    await lockersCol.updateOne({ id: member.currentLockerId, status: "debtor" }, { $set: { status: "active" } });
  }
  const now = /* @__PURE__ */ new Date();
  await transactionsCol.insertOne({ id: `tx_${Date.now()}`, type: "membership", amount, description: `\u067E\u0631\u062F\u0627\u062E\u062A \u0634\u0647\u0631\u06CC\u0647 ${member.name}`, date: "1405/04/10" });
  await notificationsCol.insertOne({ id: `notif_${Date.now()}`, title: `\u067E\u0631\u062F\u0627\u062E\u062A \u0634\u0647\u0631\u06CC\u0647: ${member.name}`, message: `${member.name} \u0645\u0628\u0644\u063A ${amount.toLocaleString("fa-IR")} \u062A\u0648\u0645\u0627\u0646 \u067E\u0631\u062F\u0627\u062E\u062A \u06A9\u0631\u062F.`, date: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, isRead: false });
  const updatedMember = await membersCol.findOne({ id: req.params.id });
  emit("payment:received", { member: updatedMember, amount });
  res.status(200).json({ success: true, member: updatedMember });
});
app.get("/api/lockers", async (req, res) => {
  const lockers = await lockersCol.find({}).sort({ id: 1 }).toArray();
  res.json(lockers);
});
app.post("/api/lockers/:id/reserve", async (req, res) => {
  const id = Number(req.params.id);
  const locker = await lockersCol.findOne({ id });
  if (!locker) return res.status(404).json({ message: "\u06A9\u0645\u062F \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  if (locker.status !== "empty") return res.status(400).json({ message: "\u06A9\u0645\u062F \u062E\u0627\u0644\u06CC \u0646\u06CC\u0633\u062A." });
  const { memberName, note, memberId } = req.body;
  let mId = null, mName = memberName || "\u0631\u0632\u0631\u0648 \u0634\u062F\u0647", mPhoto = null, mshipId = null;
  if (memberId) {
    const m = await membersCol.findOne({ id: memberId });
    if (m) {
      mId = m.id;
      mName = m.name;
      mPhoto = m.avatar;
      mshipId = m.membershipId;
    }
  }
  const reserved = { id, status: "reserved", memberId: mId, memberName: mName, memberPhoto: mPhoto, membershipId: mshipId, checkInTime: null, reservationNote: note || "\u0628\u062F\u0648\u0646 \u062C\u0632\u0626\u06CC\u0627\u062A", isDoorOpen: false };
  await lockersCol.updateOne({ id }, { $set: reserved });
  emit("locker:updated", { locker: reserved });
  res.json(reserved);
});
app.post("/api/lockers/:id/release", async (req, res) => {
  const id = Number(req.params.id);
  const locker = await lockersCol.findOne({ id });
  if (!locker) return res.status(404).json({ message: "\u06A9\u0645\u062F \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  if (locker.memberId) {
    await membersCol.updateOne({ id: locker.memberId }, { $set: { isPresent: false, currentLockerId: null } });
    const now = /* @__PURE__ */ new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    await attendanceCol.updateOne({ memberId: locker.memberId, checkOut: null }, { $set: { checkOut: `1405/04/10 ${timeStr}` } });
  }
  const empty = { id, status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false };
  await lockersCol.updateOne({ id }, { $set: empty });
  emit("locker:updated", { locker: empty });
  res.json(empty);
});
app.post("/api/lockers/:id/toggle-door", async (req, res) => {
  const id = Number(req.params.id);
  const locker = await lockersCol.findOne({ id });
  if (!locker) return res.status(404).json({ message: "\u06A9\u0645\u062F \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const newOpen = !locker.isDoorOpen;
  await lockersCol.updateOne({ id }, { $set: { isDoorOpen: newOpen } });
  if (newOpen && locker.memberId) {
    const now = /* @__PURE__ */ new Date();
    await notificationsCol.insertOne({ id: `notif_${Date.now()}`, title: `\u0647\u0634\u062F\u0627\u0631: \u062F\u0631\u0628 \u0628\u0627\u0632 \u06A9\u0645\u062F ${id}`, message: `\u062F\u0631\u0628 \u06A9\u0645\u062F ${id} \u0645\u062A\u0639\u0644\u0642 \u0628\u0647 ${locker.memberName} \u0628\u0627\u0632 \u0627\u0633\u062A.`, date: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, isRead: false });
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
  if (!src || !tgt) return res.status(404).json({ message: "\u06A9\u0645\u062F \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  if (src.status === "empty") return res.status(400).json({ message: "\u06A9\u0645\u062F \u0645\u0628\u062F\u0623 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A." });
  if (tgt.status !== "empty") return res.status(400).json({ message: "\u06A9\u0645\u062F \u0645\u0642\u0635\u062F \u067E\u0631 \u0627\u0633\u062A." });
  await lockersCol.updateOne({ id: tgtId }, { $set: { ...src, id: tgtId } });
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
  if (!guestName || !guestPhone) return res.status(400).json({ success: false, message: "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0646\u0627\u0642\u0635." });
  const locker = await lockersCol.findOne({ id });
  if (!locker || locker.status !== "empty") return res.status(400).json({ success: false, message: "\u06A9\u0645\u062F \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A." });
  const guestId = `guest_${Date.now()}`;
  const memberCount = await membersCol.countDocuments();
  const membershipId = `GUEST-${1e3 + memberCount + 1}`;
  const guestAvatar = gender === "female" ? "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150" : "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150";
  await membersCol.insertOne({ id: guestId, name: guestName, phone: guestPhone, gender: gender || "male", joinDate: "1405/04/10", endDate: "1405/04/10", membershipStatus: "active", feeStatus: "settled", totalFee: 1e5, paidFee: 5e4, avatar: guestAvatar, membershipId, weightHistory: [], workoutPlan: null, dietPlan: null, isPresent: false, currentLockerId: null });
  await lockersCol.updateOne({ id }, { $set: { status: "reserved", memberId: guestId, memberName: guestName, memberPhoto: guestAvatar, membershipId, checkInTime: null, reservationNote: "\u0631\u0632\u0631\u0648 \u0645\u0647\u0645\u0627\u0646", isDoorOpen: false } });
  await lockerRequestsCol.insertOne({ id: `req_${Date.now()}`, memberId: guestId, memberName: guestName, memberPhoto: guestAvatar, membershipId, type: "allocation", status: "pending", date: "1405/04/10", time: "17:00", lockerId: id });
  await transactionsCol.insertOne({ id: `tx_${Date.now()}`, type: "membership", amount: 5e4, description: `\u0631\u0632\u0631\u0648 \u0645\u0647\u0645\u0627\u0646 ${guestName}`, date: "1405/04/10" });
  const updated = await lockersCol.findOne({ id });
  res.status(200).json({ success: true, locker: updated });
});
app.post("/api/lockers/:id/member-reserve", async (req, res) => {
  const id = Number(req.params.id);
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u0639\u0636\u0648 \u0646\u06CC\u0633\u062A." });
  const member = await membersCol.findOne({ id: memberId });
  if (!member) return res.status(404).json({ success: false, message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  if (member.isPresent || member.currentLockerId) return res.status(400).json({ success: false, message: "\u0634\u0645\u0627 \u062D\u0636\u0648\u0631 \u062F\u0627\u0631\u06CC\u062F." });
  const locker = await lockersCol.findOne({ id });
  if (!locker || locker.status !== "empty") return res.status(400).json({ success: false, message: "\u06A9\u0645\u062F \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A." });
  await lockersCol.updateOne({ id }, { $set: { status: "reserved", memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, checkInTime: null, reservationNote: "\u0631\u0632\u0631\u0648 \u0622\u0646\u0644\u0627\u06CC\u0646", isDoorOpen: false } });
  await lockerRequestsCol.insertOne({ id: `req_${Date.now()}`, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, type: "allocation", status: "pending", date: "1405/04/10", time: "17:00", lockerId: id });
  const updated = await lockersCol.findOne({ id });
  res.status(200).json({ success: true, locker: updated });
});
app.get("/api/locker-requests", async (req, res) => {
  const requests = await lockerRequestsCol.find({}).toArray();
  res.json(requests);
});
app.post("/api/locker-requests/:id/approve", async (req, res) => {
  const request = await lockerRequestsCol.findOne({ id: req.params.id });
  if (!request) return res.status(404).json({ success: false, message: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  if (request.status !== "pending") return res.status(400).json({ success: false, message: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0628\u0644\u0627\u064B \u0628\u0631\u0631\u0633\u06CC \u0634\u062F\u0647." });
  const member = await membersCol.findOne({ id: request.memberId });
  if (!member) return res.status(404).json({ success: false, message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (request.type === "allocation") {
    let lockerId = req.body.lockerId;
    let assigned;
    if (lockerId) assigned = await lockersCol.findOne({ id: Number(lockerId), status: { $in: ["empty", "reserved"] } });
    else assigned = await lockersCol.findOne({ status: "empty" });
    if (!assigned) return res.status(400).json({ success: false, message: "\u06A9\u0645\u062F \u062E\u0627\u0644\u06CC \u0646\u06CC\u0633\u062A." });
    let status = "active";
    if (member.feeStatus === "debtor") status = "debtor";
    else if (member.membershipStatus === "expiring") status = "expiring";
    await lockersCol.updateOne({ id: assigned.id }, { $set: { status, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, checkInTime: timeStr, reservationNote: null, isDoorOpen: false } });
    await membersCol.updateOne({ id: member.id }, { $set: { isPresent: true, currentLockerId: assigned.id } });
    await attendanceCol.insertOne({ id: `att_${Date.now()}`, memberId: member.id, memberName: member.name, lockerId: assigned.id, checkIn: `1405/04/10 ${timeStr}`, checkOut: null });
    await lockerRequestsCol.updateOne({ id: request.id }, { $set: { status: "approved", lockerId: assigned.id } });
  } else if (request.type === "checkout") {
    if (!member.isPresent || !member.currentLockerId) return res.status(400).json({ success: false, message: "\u0639\u0636\u0648 \u062D\u0636\u0648\u0631 \u0646\u062F\u0627\u0631\u062F." });
    const lockerId = member.currentLockerId;
    await lockersCol.updateOne({ id: lockerId }, { $set: { status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false } });
    await membersCol.updateOne({ id: member.id }, { $set: { isPresent: false, currentLockerId: null } });
    await attendanceCol.updateOne({ memberId: member.id, checkOut: null }, { $set: { checkOut: `1405/04/10 ${timeStr}` } });
    await lockerRequestsCol.updateOne({ id: request.id }, { $set: { status: "approved" } });
  }
  const updated = await lockerRequestsCol.findOne({ id: request.id });
  res.json({ success: true, request: updated });
});
app.post("/api/locker-requests/:id/reject", async (req, res) => {
  const request = await lockerRequestsCol.findOne({ id: req.params.id });
  if (!request) return res.status(404).json({ success: false, message: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  await lockerRequestsCol.updateOne({ id: request.id }, { $set: { status: "rejected" } });
  const updated = await lockerRequestsCol.findOne({ id: request.id });
  res.json({ success: true, request: updated });
});
app.post("/api/locker-requests", async (req, res) => {
  const { memberId, type } = req.body;
  if (!memberId || !type) return res.status(400).json({ success: false, message: "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0646\u0627\u0642\u0635." });
  const member = await membersCol.findOne({ id: memberId });
  if (!member) return res.status(404).json({ success: false, message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const newReq = { id: `req_${Date.now()}`, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, type, status: "pending", date: "1405/04/10", time: timeStr, lockerId: type === "checkout" ? member.currentLockerId : null };
  await lockerRequestsCol.insertOne(newReq);
  await notificationsCol.insertOne({ id: `notif_${Date.now()}`, title: type === "allocation" ? `\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06A9\u0645\u062F: ${member.name}` : `\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062A\u062E\u0644\u06CC\u0647: ${member.name}`, message: `${member.name} \u062F\u0631\u062E\u0648\u0627\u0633\u062A ${type === "allocation" ? "\u06A9\u0645\u062F \u062C\u062F\u06CC\u062F" : "\u062A\u062E\u0644\u06CC\u0647"} \u062F\u0627\u062F\u0647.`, date: timeStr, isRead: false });
  res.status(201).json({ success: true, request: newReq });
});
app.get("/api/stats", async (req, res) => {
  const allMembers = await membersCol.find({}).toArray();
  const allAttendance = await attendanceCol.find({}).toArray();
  const allTransactions = await transactionsCol.find({}).toArray();
  const totalMembers = allMembers.length;
  const presentMembers = allMembers.filter((m) => m.isPresent).length;
  const leftMembersToday = allAttendance.filter((a) => a.checkOut !== null).length;
  const todayIncome = allTransactions.reduce((acc, cur) => acc + (cur.amount || 0), 0);
  const monthIncome = todayIncome + 148e5;
  const debtorCount = allMembers.filter((m) => m.feeStatus === "debtor" || m.feeStatus === "partial").length;
  const expiringSoonCount = allMembers.filter((m) => m.membershipStatus === "expiring").length;
  const buffetSales = allTransactions.filter((tx) => tx.type === "buffet").reduce((acc, cur) => acc + (cur.amount || 0), 0);
  const storeSales = allTransactions.filter((tx) => tx.type === "store").reduce((acc, cur) => acc + (cur.amount || 0), 0);
  res.json({ totalMembers, presentMembers, leftMembersToday, todayIncome, monthIncome, debtorCount, expiringSoonCount, buffetSales, storeSales });
});
app.get("/api/transactions", async (req, res) => {
  res.json(await transactionsCol.find({}).toArray());
});
app.get("/api/attendance", async (req, res) => {
  res.json(await attendanceCol.find({}).toArray());
});
app.get("/api/notifications", async (req, res) => {
  res.json(await notificationsCol.find({}).toArray());
});
app.post("/api/notifications/read", async (req, res) => {
  await notificationsCol.updateOne({ id: req.body.id }, { $set: { isRead: true } });
  res.json({ success: true });
});
app.post("/api/sales", async (req, res) => {
  const tx = { id: `tx_${Date.now()}`, type: req.body.type, amount: Number(req.body.amount), description: req.body.description, date: "1405/04/10" };
  await transactionsCol.insertOne(tx);
  res.status(201).json(tx);
});
app.get("/api/messages", async (req, res) => {
  const { memberId } = req.query;
  const filter = memberId ? { memberId } : {};
  res.json(await messagesCol.find(filter).toArray());
});
app.post("/api/messages", async (req, res) => {
  const { memberId, memberName, text, sender } = req.body;
  if (!memberId || !text || !sender) return res.status(400).json({ success: false, message: "\u0646\u0627\u0642\u0635." });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const msg = { id: `msg_${Date.now()}`, memberId, memberName: memberName || "\u0648\u0631\u0632\u0634\u06A9\u0627\u0631", text, sender, date: "1405/04/15", time: timeStr, isRead: false };
  await messagesCol.insertOne(msg);
  emit("message:new", { message: msg });
  res.json({ success: true, message: msg });
});
app.post("/api/messages/:id/reply", async (req, res) => {
  const msg = await messagesCol.findOne({ id: req.params.id });
  if (!msg) return res.status(404).json({ success: false, message: "\u067E\u06CC\u0627\u0645 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  await messagesCol.updateOne({ id: req.params.id }, { $set: { replyText: req.body.replyText, replyDate: "1405/04/15", replyTime: timeStr, isReplied: true, isRead: true } });
  const updated = await messagesCol.findOne({ id: req.params.id });
  res.json({ success: true, message: updated });
});
app.get("/api/transformations", async (req, res) => {
  if (req.query.publicOnly === "true") return res.json(await transformationsCol.find({ isPublic: true }).toArray());
  res.json(await transformationsCol.find({}).toArray());
});
app.post("/api/transformations", async (req, res) => {
  const t = { id: `trans_${Date.now()}`, ...req.body, date: "1405/04/10", consentGranted: !!req.body.consentGranted, isPublic: !!req.body.isPublic };
  await transformationsCol.insertOne(t);
  res.status(201).json({ success: true, transformation: t });
});
app.put("/api/transformations/:id", async (req, res) => {
  const t = await transformationsCol.findOne({ id: req.params.id });
  if (!t) return res.status(404).json({ success: false, message: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  await transformationsCol.updateOne({ id: req.params.id }, { $set: req.body });
  const updated = await transformationsCol.findOne({ id: req.params.id });
  res.json({ success: true, transformation: updated });
});
app.delete("/api/transformations/:id", async (req, res) => {
  const t = await transformationsCol.findOne({ id: req.params.id });
  if (!t) return res.status(404).json({ success: false, message: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  await transformationsCol.deleteOne({ id: req.params.id });
  res.json({ success: true });
});
app.post("/api/payment/zarinpal/initiate", (req, res) => {
  res.json({ success: true, redirectUrl: "#", authority: "CLOUD_SIM", simulated: true, message: "\u067E\u0631\u062F\u0627\u062E\u062A \u0627\u0628\u0631\u06CC \u0634\u0628\u06CC\u0647\u200C\u0633\u0627\u0632\u06CC \u0634\u062F." });
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now(), db: MONGODB_URI ? "mongodb" : "file" });
});
var distPath = import_path.default.join(process.cwd(), "dist");
if (import_fs.default.existsSync(distPath)) {
  app.use(import_express.default.static(distPath));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api/")) {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    }
  });
  console.log("Serving static frontend from dist/");
}
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
