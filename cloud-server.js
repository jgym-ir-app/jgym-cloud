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
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
var app = (0, import_express.default)();
var PORT = process.env.PORT || 3e3;
var DB_FILE = process.env.DATABASE_PATH || import_path.default.join(process.cwd(), "db.json");
app.use((0, import_cors.default)());
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
function defaultDB() {
  return {
    members: [],
    lockers: Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      status: "empty",
      memberId: null,
      memberName: null,
      memberPhoto: null,
      membershipId: null,
      checkInTime: null,
      reservationNote: null,
      isDoorOpen: false
    })),
    attendance: [],
    transactions: [],
    notifications: [],
    lockerRequests: [],
    messages: [],
    transformations: [],
    settings: {
      coachName: "\u062C\u0627\u0628\u0631 \u067E\u0648\u0631\u0639\u0628\u0627\u0633",
      coachPhone: "09112223344",
      adminUsername: "jgym",
      adminPassword: "Jgym123321"
    }
  };
}
function initDB() {
  if (import_fs.default.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(import_fs.default.readFileSync(DB_FILE, "utf-8"));
      if (data.members && data.lockers) return data;
    } catch {
    }
  }
  const db = defaultDB();
  import_fs.default.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  return db;
}
function getDB() {
  try {
    const data = JSON.parse(import_fs.default.readFileSync(DB_FILE, "utf-8"));
    if (data.members && data.lockers) {
      if (!data.attendance) data.attendance = [];
      if (!data.transactions) data.transactions = [];
      if (!data.notifications) data.notifications = [];
      if (!data.lockerRequests) data.lockerRequests = [];
      if (!data.messages) data.messages = [];
      if (!data.settings) data.settings = {};
      if (!data.transformations) data.transformations = [];
      return data;
    }
  } catch (e) {
    console.error("DB read error:", e);
  }
  return initDB();
}
function saveDB(data) {
  import_fs.default.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
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
app.post("/api/auth/login", (req, res) => {
  const { role, phone, password, username } = req.body;
  const db = getDB();
  if (role === "admin") {
    if (username === (db.settings?.adminUsername || "jgym") && password === (db.settings?.adminPassword || "Jgym123321")) {
      return res.json({ success: true, token: "admin-jwt", user: { name: db.settings?.coachName || "\u062C\u0627\u0628\u0631 \u067E\u0648\u0631\u0639\u0628\u0627\u0633", role: "admin" } });
    }
    return res.status(401).json({ success: false, message: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A." });
  }
  if (role === "member") {
    const member = db.members.find((m) => m.phone === phone);
    if (member && password === (member.password || member.phone)) {
      return res.json({ success: true, token: `member-${member.id}`, user: { ...member, role: "member" } });
    }
    return res.status(401).json({ success: false, message: "\u0634\u0645\u0627\u0631\u0647 \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A." });
  }
  return res.status(400).json({ success: false, message: "\u0646\u0648\u0639 \u0648\u0631\u0648\u062F \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." });
});
app.get("/api/settings", (req, res) => {
  res.json(getDB().settings || {});
});
app.post("/api/settings", (req, res) => {
  const db = getDB();
  db.settings = { ...db.settings, ...req.body };
  saveDB(db);
  res.json({ success: true, settings: db.settings });
});
app.get("/api/members", (req, res) => {
  res.json(getDB().members);
});
app.post("/api/members", (req, res) => {
  const db = getDB();
  const { name, phone, gender, joinDate, endDate, feeStatus, totalFee, paidFee, avatar, nationalCode, birthDate, height, targetWeight, bodyFat, muscleMass, address, password } = req.body;
  const membershipId = `JG-${100 + db.members.length + 1}`;
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
  db.members.push(newMember);
  if (paidFee > 0) {
    db.transactions.push({ id: `tx_${Date.now()}`, type: "membership", amount: Number(paidFee), description: `\u062B\u0628\u062A \u0646\u0627\u0645 ${name}`, date: joinDate || "1405/04/10" });
  }
  saveDB(db);
  emit("member:created", { member: newMember });
  res.status(201).json(newMember);
});
app.put("/api/members/:id", (req, res) => {
  const db = getDB();
  const idx = db.members.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Member not found" });
  db.members[idx] = { ...db.members[idx], ...req.body };
  db.lockers.forEach((l) => {
    if (l.memberId === db.members[idx].id) {
      l.memberName = db.members[idx].name;
      l.memberPhoto = db.members[idx].avatar;
    }
  });
  saveDB(db);
  emit("member:updated", { member: db.members[idx] });
  res.json(db.members[idx]);
});
app.delete("/api/members/:id", (req, res) => {
  const db = getDB();
  const idx = db.members.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Member not found" });
  const member = db.members[idx];
  if (member.currentLockerId) {
    const li = db.lockers.findIndex((l) => l.id === member.currentLockerId);
    if (li !== -1) db.lockers[li] = { id: member.currentLockerId, status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false };
  }
  db.members.splice(idx, 1);
  saveDB(db);
  emit("member:deleted", { memberId: req.params.id });
  res.json({ success: true });
});
app.post("/api/members/:id/weight", (req, res) => {
  const db = getDB();
  const member = db.members.find((m) => m.id === req.params.id);
  if (!member) return res.status(404).json({ message: "Member not found" });
  member.weightHistory.push({ date: req.body.date, weight: Number(req.body.weight) });
  saveDB(db);
  res.json(member);
});
app.post("/api/members/:id/checkin", (req, res) => {
  const db = getDB();
  const idx = db.members.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const member = db.members[idx];
  if (member.isPresent) return res.status(400).json({ message: "\u0627\u06CC\u0646 \u0639\u0636\u0648 \u0642\u0628\u0644\u0627\u064B \u0648\u0627\u0631\u062F \u0634\u062F\u0647." });
  let lockerId = req.body.lockerId;
  if (!lockerId) {
    const empty = db.lockers.find((l) => l.status === "empty");
    if (!empty) return res.status(400).json({ message: "\u06A9\u0645\u062F \u062E\u0627\u0644\u06CC \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F." });
    lockerId = empty.id;
  }
  const locker = db.lockers.find((l) => l.id === Number(lockerId));
  if (!locker || locker.status !== "empty") return res.status(400).json({ message: "\u06A9\u0645\u062F \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A." });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  let status = "active";
  if (member.feeStatus === "debtor") status = "debtor";
  else if (member.membershipStatus === "expiring") status = "expiring";
  const li = db.lockers.findIndex((l) => l.id === Number(lockerId));
  db.lockers[li] = { id: Number(lockerId), status, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, checkInTime: timeStr, reservationNote: null, isDoorOpen: false };
  member.isPresent = true;
  member.currentLockerId = Number(lockerId);
  db.attendance.push({ id: `att_${Date.now()}`, memberId: member.id, memberName: member.name, lockerId: Number(lockerId), checkIn: `1405/04/10 ${timeStr}`, checkOut: null });
  saveDB(db);
  emit("member:checkedin", { member, locker: db.lockers[li] });
  res.json({ success: true, member, locker: db.lockers[li] });
});
app.post("/api/members/:id/checkout", (req, res) => {
  const db = getDB();
  const idx = db.members.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const member = db.members[idx];
  if (!member.isPresent || !member.currentLockerId) return res.status(400).json({ message: "\u0639\u0636\u0648 \u062D\u0636\u0648\u0631 \u0646\u062F\u0627\u0631\u062F." });
  const lockerId = member.currentLockerId;
  const li = db.lockers.findIndex((l) => l.id === lockerId);
  if (li !== -1) db.lockers[li] = { id: lockerId, status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false };
  member.isPresent = false;
  member.currentLockerId = null;
  const att = db.attendance.find((a) => a.memberId === member.id && a.checkOut === null);
  if (att) {
    const now = /* @__PURE__ */ new Date();
    att.checkOut = `1405/04/10 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
  saveDB(db);
  emit("member:checkedout", { member });
  res.json({ success: true, member });
});
app.post("/api/members/:id/pay-tuition", (req, res) => {
  const db = getDB();
  const idx = db.members.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const member = db.members[idx];
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "\u0645\u0628\u0644\u063A \u0646\u0627\u0645\u0639\u062A\u0628\u0631." });
  member.paidFee += amount;
  if (member.paidFee >= member.totalFee) {
    member.feeStatus = "settled";
    if (member.membershipStatus === "debtor") member.membershipStatus = "active";
  } else if (member.paidFee > 0) member.feeStatus = "partial";
  if (member.currentLockerId) {
    const li = db.lockers.findIndex((l) => l.id === member.currentLockerId);
    if (li !== -1 && db.lockers[li].status === "debtor" && member.feeStatus === "settled") db.lockers[li].status = "active";
  }
  const now = /* @__PURE__ */ new Date();
  db.transactions.push({ id: `tx_${Date.now()}`, type: "membership", amount, description: `\u067E\u0631\u062F\u0627\u062E\u062A \u0634\u0647\u0631\u06CC\u0647 ${member.name}`, date: "1405/04/10" });
  db.notifications.unshift({ id: `notif_${Date.now()}`, title: `\u067E\u0631\u062F\u0627\u062E\u062A \u0634\u0647\u0631\u06CC\u0647: ${member.name}`, message: `${member.name} \u0645\u0628\u0644\u063A ${amount.toLocaleString("fa-IR")} \u062A\u0648\u0645\u0627\u0646 \u067E\u0631\u062F\u0627\u062E\u062A \u06A9\u0631\u062F.`, date: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, isRead: false });
  saveDB(db);
  emit("payment:received", { member, amount });
  res.status(200).json({ success: true, member });
});
app.get("/api/lockers", (req, res) => {
  res.json(getDB().lockers);
});
app.post("/api/lockers/:id/reserve", (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const li = db.lockers.findIndex((l) => l.id === id);
  if (li === -1) return res.status(404).json({ message: "\u06A9\u0645\u062F \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  if (db.lockers[li].status !== "empty") return res.status(400).json({ message: "\u06A9\u0645\u062F \u062E\u0627\u0644\u06CC \u0646\u06CC\u0633\u062A." });
  const { memberName, note, memberId } = req.body;
  let mId = null, mName = memberName || "\u0631\u0632\u0631\u0648 \u0634\u062F\u0647", mPhoto = null, mshipId = null;
  if (memberId) {
    const m = db.members.find((x) => x.id === memberId);
    if (m) {
      mId = m.id;
      mName = m.name;
      mPhoto = m.avatar;
      mshipId = m.membershipId;
    }
  }
  db.lockers[li] = { id, status: "reserved", memberId: mId, memberName: mName, memberPhoto: mPhoto, membershipId: mshipId, checkInTime: null, reservationNote: note || "\u0628\u062F\u0648\u0646 \u062C\u0632\u0626\u06CC\u0627\u062A", isDoorOpen: false };
  saveDB(db);
  emit("locker:updated", { locker: db.lockers[li] });
  res.json(db.lockers[li]);
});
app.post("/api/lockers/:id/release", (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const li = db.lockers.findIndex((l) => l.id === id);
  if (li === -1) return res.status(404).json({ message: "\u06A9\u0645\u062F \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const locker = db.lockers[li];
  if (locker.memberId) {
    const member = db.members.find((m) => m.id === locker.memberId);
    if (member) {
      member.isPresent = false;
      member.currentLockerId = null;
    }
    const att = db.attendance.find((a) => a.memberId === locker.memberId && a.checkOut === null);
    if (att) {
      const now = /* @__PURE__ */ new Date();
      att.checkOut = `1405/04/10 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    }
  }
  db.lockers[li] = { id, status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false };
  saveDB(db);
  emit("locker:updated", { locker: db.lockers[li] });
  res.json(db.lockers[li]);
});
app.post("/api/lockers/:id/toggle-door", (req, res) => {
  const db = getDB();
  const li = db.lockers.findIndex((l) => l.id === Number(req.params.id));
  if (li === -1) return res.status(404).json({ message: "\u06A9\u0645\u062F \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  db.lockers[li].isDoorOpen = !db.lockers[li].isDoorOpen;
  if (db.lockers[li].isDoorOpen && db.lockers[li].memberId) {
    db.notifications.unshift({ id: `notif_${Date.now()}`, title: `\u0647\u0634\u062F\u0627\u0631: \u062F\u0631\u0628 \u0628\u0627\u0632 \u06A9\u0645\u062F ${req.params.id}`, message: `\u062F\u0631\u0628 \u06A9\u0645\u062F ${req.params.id} \u0645\u062A\u0639\u0644\u0642 \u0628\u0647 ${db.lockers[li].memberName} \u0628\u0627\u0632 \u0627\u0633\u062A.`, date: "\u06F1\u06F7:\u06F0\u06F5", isRead: false });
  }
  saveDB(db);
  emit("locker:updated", { locker: db.lockers[li] });
  res.json(db.lockers[li]);
});
app.post("/api/lockers/move", (req, res) => {
  const db = getDB();
  const srcIdx = db.lockers.findIndex((l) => l.id === Number(req.body.sourceLockerId));
  const tgtIdx = db.lockers.findIndex((l) => l.id === Number(req.body.targetLockerId));
  if (srcIdx === -1 || tgtIdx === -1) return res.status(404).json({ message: "\u06A9\u0645\u062F \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  if (db.lockers[srcIdx].status === "empty") return res.status(400).json({ message: "\u06A9\u0645\u062F \u0645\u0628\u062F\u0623 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A." });
  if (db.lockers[tgtIdx].status !== "empty") return res.status(400).json({ message: "\u06A9\u0645\u062F \u0645\u0642\u0635\u062F \u067E\u0631 \u0627\u0633\u062A." });
  db.lockers[tgtIdx] = { ...db.lockers[srcIdx], id: Number(req.body.targetLockerId) };
  if (db.lockers[tgtIdx].memberId) {
    const member = db.members.find((m) => m.id === db.lockers[tgtIdx].memberId);
    if (member) member.currentLockerId = Number(req.body.targetLockerId);
  }
  db.lockers[srcIdx] = { id: Number(req.body.sourceLockerId), status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false };
  saveDB(db);
  emit("locker:moved", { lockers: db.lockers });
  res.json({ success: true, lockers: db.lockers });
});
app.post("/api/lockers/:id/guest-reserve", (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const { guestName, guestPhone, gender } = req.body;
  if (!guestName || !guestPhone) return res.status(400).json({ success: false, message: "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0646\u0627\u0642\u0635." });
  const li = db.lockers.findIndex((l) => l.id === id);
  if (li === -1 || db.lockers[li].status !== "empty") return res.status(400).json({ success: false, message: "\u06A9\u0645\u062F \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A." });
  const guestId = `guest_${Date.now()}`;
  const membershipId = `GUEST-${1e3 + db.members.length + 1}`;
  db.members.push({ id: guestId, name: guestName, phone: guestPhone, gender: gender || "male", joinDate: "1405/04/10", endDate: "1405/04/10", membershipStatus: "active", feeStatus: "settled", totalFee: 1e5, paidFee: 5e4, avatar: gender === "female" ? "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150" : "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150", membershipId, weightHistory: [], workoutPlan: null, dietPlan: null, isPresent: false, currentLockerId: null });
  db.lockers[li] = { id, status: "reserved", memberId: guestId, memberName: guestName, memberPhoto: db.members[db.members.length - 1].avatar, membershipId, checkInTime: null, reservationNote: "\u0631\u0632\u0631\u0648 \u0645\u0647\u0645\u0627\u0646", isDoorOpen: false };
  db.lockerRequests.push({ id: `req_${Date.now()}`, memberId: guestId, memberName: guestName, memberPhoto: db.members[db.members.length - 1].avatar, membershipId, type: "allocation", status: "pending", date: "1405/04/10", time: "17:00", lockerId: id });
  db.transactions.push({ id: `tx_${Date.now()}`, type: "membership", amount: 5e4, description: `\u0631\u0632\u0631\u0648 \u0645\u0647\u0645\u0627\u0646 ${guestName}`, date: "1405/04/10" });
  saveDB(db);
  res.status(200).json({ success: true, locker: db.lockers[li] });
});
app.post("/api/lockers/:id/member-reserve", (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u0639\u0636\u0648 \u0646\u06CC\u0633\u062A." });
  const mIdx = db.members.findIndex((m) => m.id === memberId);
  if (mIdx === -1) return res.status(404).json({ success: false, message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const member = db.members[mIdx];
  if (member.isPresent || member.currentLockerId) return res.status(400).json({ success: false, message: "\u0634\u0645\u0627 \u062D\u0636\u0648\u0631 \u062F\u0627\u0631\u06CC\u062F." });
  const li = db.lockers.findIndex((l) => l.id === id);
  if (li === -1 || db.lockers[li].status !== "empty") return res.status(400).json({ success: false, message: "\u06A9\u0645\u062F \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A." });
  db.lockers[li] = { id, status: "reserved", memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, checkInTime: null, reservationNote: "\u0631\u0632\u0631\u0648 \u0622\u0646\u0644\u0627\u06CC\u0646", isDoorOpen: false };
  db.lockerRequests.push({ id: `req_${Date.now()}`, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, type: "allocation", status: "pending", date: "1405/04/10", time: "17:00", lockerId: id });
  saveDB(db);
  res.status(200).json({ success: true, locker: db.lockers[li] });
});
app.get("/api/locker-requests", (req, res) => {
  res.json(getDB().lockerRequests || []);
});
app.post("/api/locker-requests/:id/approve", (req, res) => {
  const db = getDB();
  const ri = (db.lockerRequests || []).findIndex((r) => r.id === req.params.id);
  if (ri === -1) return res.status(404).json({ success: false, message: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const request = db.lockerRequests[ri];
  if (request.status !== "pending") return res.status(400).json({ success: false, message: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0628\u0644\u0627\u064B \u0628\u0631\u0631\u0633\u06CC \u0634\u062F\u0647." });
  const member = db.members.find((m) => m.id === request.memberId);
  if (!member) return res.status(404).json({ success: false, message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (request.type === "allocation") {
    let lockerId = req.body.lockerId;
    let assigned;
    if (lockerId) assigned = db.lockers.find((l) => l.id === Number(lockerId) && (l.status === "empty" || l.status === "reserved"));
    else assigned = db.lockers.find((l) => l.status === "empty");
    if (!assigned) return res.status(400).json({ success: false, message: "\u06A9\u0645\u062F \u062E\u0627\u0644\u06CC \u0646\u06CC\u0633\u062A." });
    let status = "active";
    if (member.feeStatus === "debtor") status = "debtor";
    else if (member.membershipStatus === "expiring") status = "expiring";
    const li = db.lockers.findIndex((l) => l.id === assigned.id);
    db.lockers[li] = { id: assigned.id, status, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, checkInTime: timeStr, reservationNote: null, isDoorOpen: false };
    member.isPresent = true;
    member.currentLockerId = assigned.id;
    db.attendance.push({ id: `att_${Date.now()}`, memberId: member.id, memberName: member.name, lockerId: assigned.id, checkIn: `1405/04/10 ${timeStr}`, checkOut: null });
    request.status = "approved";
    request.lockerId = assigned.id;
  } else if (request.type === "checkout") {
    if (!member.isPresent || !member.currentLockerId) return res.status(400).json({ success: false, message: "\u0639\u0636\u0648 \u062D\u0636\u0648\u0631 \u0646\u062F\u0627\u0631\u062F." });
    const lockerId = member.currentLockerId;
    const li = db.lockers.findIndex((l) => l.id === lockerId);
    if (li !== -1) db.lockers[li] = { id: lockerId, status: "empty", memberId: null, memberName: null, memberPhoto: null, membershipId: null, checkInTime: null, reservationNote: null, isDoorOpen: false };
    member.isPresent = false;
    member.currentLockerId = null;
    const att = db.attendance.find((a) => a.memberId === member.id && a.checkOut === null);
    if (att) att.checkOut = `1405/04/10 ${timeStr}`;
    request.status = "approved";
  }
  saveDB(db);
  res.json({ success: true, request });
});
app.post("/api/locker-requests/:id/reject", (req, res) => {
  const db = getDB();
  const ri = (db.lockerRequests || []).findIndex((r) => r.id === req.params.id);
  if (ri === -1) return res.status(404).json({ success: false, message: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  db.lockerRequests[ri].status = "rejected";
  saveDB(db);
  res.json({ success: true, request: db.lockerRequests[ri] });
});
app.post("/api/locker-requests", (req, res) => {
  const db = getDB();
  const { memberId, type } = req.body;
  if (!memberId || !type) return res.status(400).json({ success: false, message: "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0646\u0627\u0642\u0635." });
  const member = db.members.find((m) => m.id === memberId);
  if (!member) return res.status(404).json({ success: false, message: "\u0639\u0636\u0648 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const newReq = { id: `req_${Date.now()}`, memberId: member.id, memberName: member.name, memberPhoto: member.avatar, membershipId: member.membershipId, type, status: "pending", date: "1405/04/10", time: timeStr, lockerId: type === "checkout" ? member.currentLockerId : null };
  db.lockerRequests.push(newReq);
  db.notifications.unshift({ id: `notif_${Date.now()}`, title: type === "allocation" ? `\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06A9\u0645\u062F: ${member.name}` : `\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062A\u062E\u0644\u06CC\u0647: ${member.name}`, message: `${member.name} \u062F\u0631\u062E\u0648\u0627\u0633\u062A ${type === "allocation" ? "\u06A9\u0645\u062F \u062C\u062F\u06CC\u062F" : "\u062A\u062E\u0644\u06CC\u0647"} \u062F\u0627\u062F\u0647.`, date: timeStr, isRead: false });
  saveDB(db);
  res.status(201).json({ success: true, request: newReq });
});
app.get("/api/stats", (req, res) => {
  const db = getDB();
  const totalMembers = db.members.length;
  const presentMembers = db.members.filter((m) => m.isPresent).length;
  const leftMembersToday = db.attendance.filter((a) => a.checkOut !== null).length;
  const todayIncome = db.transactions.reduce((acc, cur) => acc + cur.amount, 0);
  const monthIncome = todayIncome + 148e5;
  const debtorCount = db.members.filter((m) => m.feeStatus === "debtor" || m.feeStatus === "partial").length;
  const expiringSoonCount = db.members.filter((m) => m.membershipStatus === "expiring").length;
  const buffetSales = db.transactions.filter((tx) => tx.type === "buffet").reduce((acc, cur) => acc + cur.amount, 0);
  const storeSales = db.transactions.filter((tx) => tx.type === "store").reduce((acc, cur) => acc + cur.amount, 0);
  res.json({ totalMembers, presentMembers, leftMembersToday, todayIncome, monthIncome, debtorCount, expiringSoonCount, buffetSales, storeSales });
});
app.get("/api/transactions", (req, res) => {
  res.json(getDB().transactions);
});
app.get("/api/attendance", (req, res) => {
  res.json(getDB().attendance);
});
app.get("/api/notifications", (req, res) => {
  res.json(getDB().notifications);
});
app.post("/api/notifications/read", (req, res) => {
  const db = getDB();
  const idx = db.notifications.findIndex((n) => n.id === req.body.id);
  if (idx !== -1) {
    db.notifications[idx].isRead = true;
    saveDB(db);
  }
  res.json({ success: true });
});
app.post("/api/sales", (req, res) => {
  const db = getDB();
  const tx = { id: `tx_${Date.now()}`, type: req.body.type, amount: Number(req.body.amount), description: req.body.description, date: "1405/04/10" };
  db.transactions.push(tx);
  saveDB(db);
  res.status(201).json(tx);
});
app.get("/api/messages", (req, res) => {
  const db = getDB();
  const { memberId } = req.query;
  let messages = db.messages || [];
  if (memberId) messages = messages.filter((m) => m.memberId === memberId);
  res.json(messages);
});
app.post("/api/messages", (req, res) => {
  const db = getDB();
  const { memberId, memberName, text, sender } = req.body;
  if (!memberId || !text || !sender) return res.status(400).json({ success: false, message: "\u0646\u0627\u0642\u0635." });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const msg = { id: `msg_${Date.now()}`, memberId, memberName: memberName || "\u0648\u0631\u0632\u0634\u06A9\u0627\u0631", text, sender, date: "1405/04/15", time: timeStr, isRead: false };
  if (!db.messages) db.messages = [];
  db.messages.push(msg);
  saveDB(db);
  emit("message:new", { message: msg });
  res.json({ success: true, message: msg });
});
app.post("/api/messages/:id/reply", (req, res) => {
  const db = getDB();
  const idx = (db.messages || []).findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "\u067E\u06CC\u0627\u0645 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  db.messages[idx] = { ...db.messages[idx], replyText: req.body.replyText, replyDate: "1405/04/15", replyTime: timeStr, isReplied: true, isRead: true };
  saveDB(db);
  res.json({ success: true, message: db.messages[idx] });
});
app.get("/api/transformations", (req, res) => {
  const db = getDB();
  if (req.query.publicOnly === "true") return res.json((db.transformations || []).filter((t) => t.isPublic));
  res.json(db.transformations || []);
});
app.post("/api/transformations", (req, res) => {
  const db = getDB();
  const t = { id: `trans_${Date.now()}`, ...req.body, date: "1405/04/10", consentGranted: !!req.body.consentGranted, isPublic: !!req.body.isPublic };
  if (!db.transformations) db.transformations = [];
  db.transformations.push(t);
  saveDB(db);
  res.status(201).json({ success: true, transformation: t });
});
app.put("/api/transformations/:id", (req, res) => {
  const db = getDB();
  const idx = (db.transformations || []).findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  db.transformations[idx] = { ...db.transformations[idx], ...req.body };
  saveDB(db);
  res.json({ success: true, transformation: db.transformations[idx] });
});
app.delete("/api/transformations/:id", (req, res) => {
  const db = getDB();
  const idx = (db.transformations || []).findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "\u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  db.transformations.splice(idx, 1);
  saveDB(db);
  res.json({ success: true });
});
app.post("/api/payment/zarinpal/initiate", (req, res) => {
  res.json({ success: true, redirectUrl: "#", authority: "CLOUD_SIM", simulated: true, message: "\u067E\u0631\u062F\u0627\u062E\u062A \u0627\u0628\u0631\u06CC \u0634\u0628\u06CC\u0647\u200C\u0633\u0627\u0632\u06CC \u0634\u062F." });
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
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
initDB();
httpServer.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`J,Gym Cloud Server running on port ${PORT}`);
});
