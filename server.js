const express = require("express");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const WIDTH = 900;
const HEIGHT = 415;
const COLORS = {
	cardTop: "#1d1633",
	cardBottom: "#2d1b4b",
	pink: "#ff7ac8",
	violet: "#8b5cf6",
	lavender: "#c9b8ff",
	white: "#ffffff",
	muted: "#a99bd0",
};
const MAX_AMOUNT = 10000000;

const FONT_DIR = path.join(__dirname, "fonts");
const FONTS = {
	"Poppins-Bold.ttf": ["PoppinsBold", "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf"],
	"Poppins-Medium.ttf": ["PoppinsMedium", "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Medium.ttf"],
};

async function setupFonts() {
	fs.mkdirSync(FONT_DIR, { recursive: true });
	for (const [file, [alias, url]] of Object.entries(FONTS)) {
		const target = path.join(FONT_DIR, file);
		try {
			if (!fs.existsSync(target)) {
				const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
				if (!res.ok) throw new Error("HTTP " + res.status);
				fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
			}
			GlobalFonts.registerFromPath(target, alias);
		} catch (e) {
			console.warn("Police indisponible (" + file + ") : " + e.message + " -> police par defaut");
		}
	}
}

const cache = new Map();
const TTL = 10 * 60 * 1000;

async function cached(key, loader) {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.t < TTL) return hit.v;
	const v = await loader();
	cache.set(key, { v, t: Date.now() });
	return v;
}

function getUser(id) {
	return cached("u" + id, async () => {
		try {
			const res = await fetch("https://users.roblox.com/v1/users/" + id, { signal: AbortSignal.timeout(4000) });
			if (!res.ok) throw new Error("HTTP " + res.status);
			const d = await res.json();
			return { name: d.name, displayName: d.displayName || d.name };
		} catch {
			return { name: "User" + id, displayName: "User" + id };
		}
	});
}

function getAvatar(id) {
	return cached("a" + id, async () => {
		try {
			const api = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png&isCircular=false`;
			const res = await fetch(api, { signal: AbortSignal.timeout(4000) });
			const d = await res.json();
			const url = d && d.data && d.data[0] && d.data[0].imageUrl;
			if (!url) return null;
			const img = await fetch(url, { signal: AbortSignal.timeout(4000) });
			return await loadImage(Buffer.from(await img.arrayBuffer()));
		} catch {
			return null;
		}
	});
}

const rad = (d) => (d * Math.PI) / 180;

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function drawPaw(ctx, x, y, s, rot, color, alpha) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	ctx.globalAlpha = alpha;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.ellipse(0, s * 0.3, s * 0.52, s * 0.42, 0, 0, Math.PI * 2);
	ctx.fill();
	const toes = [[-0.62, -0.12, -0.45], [-0.22, -0.52, -0.12], [0.22, -0.52, 0.12], [0.62, -0.12, 0.45]];
	for (const [tx, ty, r] of toes) {
		ctx.beginPath();
		ctx.ellipse(tx * s, ty * s, s * 0.2, s * 0.28, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawEar(ctx, cx, cy, r, baseAngle, tipAngle, fill) {
	const pt = (ang, rr) => ({ x: cx + Math.cos(rad(ang)) * rr, y: cy + Math.sin(rad(ang)) * rr });
	const b1 = pt(baseAngle - 26, r - 4);
	const b2 = pt(baseAngle + 26, r - 4);
	const tip = pt(tipAngle, r * 1.55);

	ctx.lineJoin = "round";
	ctx.fillStyle = fill;
	ctx.strokeStyle = fill;
	ctx.lineWidth = 10;
	ctx.beginPath();
	ctx.moveTo(b1.x, b1.y);
	ctx.lineTo(tip.x, tip.y);
	ctx.lineTo(b2.x, b2.y);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();

	const c = { x: (b1.x + b2.x + tip.x) / 3, y: (b1.y + b2.y + tip.y) / 3 };
	const sh = (q) => ({ x: c.x + (q.x - c.x) * 0.48, y: c.y + (q.y - c.y) * 0.48 });
	const i1 = sh(b1), i2 = sh(b2), it = sh(tip);
	ctx.shadowBlur = 0;
	ctx.fillStyle = "#ffa3da";
	ctx.strokeStyle = "#ffa3da";
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.moveTo(i1.x, i1.y);
	ctx.lineTo(it.x, it.y);
	ctx.lineTo(i2.x, i2.y);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}

function drawAvatar(ctx, img, cx, cy, r, initial) {
	const g = ctx.createLinearGradient(cx - r, cy - r * 1.5, cx + r, cy + r);
	g.addColorStop(0, COLORS.pink);
	g.addColorStop(1, COLORS.violet);

	ctx.save();
	ctx.shadowColor = COLORS.pink;
	ctx.shadowBlur = 18;
	drawEar(ctx, cx, cy, r, -125, -134, g);
	drawEar(ctx, cx, cy, r, -55, -46, g);
	ctx.restore();

	ctx.save();
	ctx.shadowColor = COLORS.pink;
	ctx.shadowBlur = 26;
	ctx.beginPath();
	ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
	ctx.fillStyle = g;
	ctx.fill();
	ctx.restore();

	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
	ctx.clip();
	if (img) {
		ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
	} else {
		ctx.fillStyle = "#3a2a5c";
		ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
		ctx.fillStyle = COLORS.lavender;
		ctx.font = '60px "PoppinsBold", sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(initial, cx, cy + 4);
	}
	ctx.restore();
}

function drawWhiskers(ctx, cx, cy, r, dir) {
	ctx.save();
	ctx.strokeStyle = COLORS.lavender;
	ctx.globalAlpha = 0.75;
	ctx.lineWidth = 3;
	ctx.lineCap = "round";
	const x0 = cx + dir * (r + 14);
	const lines = [[-16, -34], [2, 2], [20, 38]];
	for (const [y0, y1] of lines) {
		ctx.beginPath();
		ctx.moveTo(x0, cy + 4 + y0);
		ctx.quadraticCurveTo(x0 + dir * 24, cy + 4 + y0 + (y1 - y0) * 0.2, x0 + dir * 50, cy + 4 + y1);
		ctx.stroke();
	}
	ctx.restore();
}

function drawSpaced(ctx, text, cx, y, spacing) {
	const chars = [...text];
	const widths = chars.map((c) => ctx.measureText(c).width);
	const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
	let x = cx - total / 2;
	ctx.textAlign = "left";
	chars.forEach((c, i) => {
		ctx.fillText(c, x, y);
		x += widths[i] + spacing;
	});
	return total;
}

function drawRobuxIcon(ctx, cx, cy, size, style) {
	ctx.save();
	ctx.strokeStyle = style;
	ctx.fillStyle = style;
	ctx.lineWidth = Math.max(4, size / 7);
	ctx.lineJoin = "round";
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const a = Math.PI / 6 + (i * Math.PI) / 3;
		const px = cx + Math.cos(a) * size;
		const py = cy + Math.sin(a) * size;
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.closePath();
	ctx.stroke();
	const s = size * 0.38;
	ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
	ctx.restore();
}

function measureSpaced(ctx, text, spacing) {
	const chars = [...text];
	return chars.reduce((acc, c) => acc + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
}

function drawSparkle(ctx, x, y, s, color, alpha) {
	ctx.save();
	ctx.translate(x, y);
	ctx.globalAlpha = alpha;
	ctx.fillStyle = color;
	ctx.shadowColor = color;
	ctx.shadowBlur = 8;
	const k = s * 0.14;
	ctx.beginPath();
	ctx.moveTo(0, -s);
	ctx.quadraticCurveTo(k, -k, s, 0);
	ctx.quadraticCurveTo(k, k, 0, s);
	ctx.quadraticCurveTo(-k, k, -s, 0);
	ctx.quadraticCurveTo(-k, -k, 0, -s);
	ctx.fill();
	ctx.restore();
}

function drawChip(ctx, text, cx, cy, c1, c2) {
	ctx.font = '11px "PoppinsBold", sans-serif';
	const w = measureSpaced(ctx, text, 3) + 28;
	const h = 22;
	const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
	g.addColorStop(0, c1);
	g.addColorStop(1, c2);
	ctx.save();
	roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
	ctx.shadowColor = c1;
	ctx.shadowBlur = 12;
	ctx.fillStyle = g;
	ctx.fill();
	ctx.shadowBlur = 0;
	ctx.lineWidth = 3;
	ctx.strokeStyle = COLORS.cardBottom;
	ctx.stroke();
	ctx.restore();
	ctx.fillStyle = COLORS.white;
	ctx.textBaseline = "alphabetic";
	ctx.font = '11px "PoppinsBold", sans-serif';
	drawSpaced(ctx, text, cx, cy + 4, 3);
}

function drawCatHead(ctx, cx, cy) {
	const fur = ctx.createLinearGradient(0, cy - 60, 0, cy + 50);
	fur.addColorStop(0, "#4a3688");
	fur.addColorStop(1, "#271c47");
	const edge = ctx.createLinearGradient(cx - 80, cy - 80, cx + 80, cy + 50);
	edge.addColorStop(0, COLORS.pink);
	edge.addColorStop(1, COLORS.violet);

	ctx.save();
	ctx.shadowColor = COLORS.pink;
	ctx.shadowBlur = 22;
	ctx.lineJoin = "round";

	for (const sd of [-1, 1]) {
		const P = (x, y) => ({ x: cx + sd * x, y: cy + y });
		const b1 = P(72, 2), b2 = P(18, -44), tip = P(66, -88);
		ctx.fillStyle = fur;
		ctx.strokeStyle = edge;
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.moveTo(b1.x, b1.y);
		ctx.lineTo(tip.x, tip.y);
		ctx.lineTo(b2.x, b2.y);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
		const i1 = P(62, -8), i2 = P(30, -38), it = P(59, -72);
		ctx.shadowBlur = 0;
		ctx.fillStyle = "#ff9ad5";
		ctx.strokeStyle = "#ff9ad5";
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(i1.x, i1.y);
		ctx.lineTo(it.x, it.y);
		ctx.lineTo(i2.x, i2.y);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
		ctx.shadowBlur = 22;
	}

	ctx.beginPath();
	ctx.ellipse(cx, cy, 80, 52, 0, 0, Math.PI * 2);
	ctx.fillStyle = fur;
	ctx.fill();
	ctx.lineWidth = 5;
	ctx.strokeStyle = edge;
	ctx.stroke();
	ctx.restore();

	ctx.save();
	ctx.strokeStyle = COLORS.lavender;
	ctx.globalAlpha = 0.5;
	ctx.lineWidth = 3.5;
	ctx.lineCap = "round";
	for (const [dx, len] of [[-12, 11], [0, 16], [12, 11]]) {
		ctx.beginPath();
		ctx.moveTo(cx + dx, cy - 44);
		ctx.lineTo(cx + dx, cy - 44 + len);
		ctx.stroke();
	}
	ctx.restore();

	ctx.save();
	ctx.fillStyle = COLORS.pink;
	ctx.globalAlpha = 0.35;
	for (const sd of [-1, 1]) {
		ctx.beginPath();
		ctx.ellipse(cx + sd * 54, cy + 20, 13, 7, 0, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();

	for (const sd of [-1, 1]) {
		const ex = cx + sd * 31, ey = cy + 5;
		ctx.save();
		const eg = ctx.createRadialGradient(ex, ey - 3, 2, ex, ey, 15);
		eg.addColorStop(0, "#fff0a0");
		eg.addColorStop(1, "#ffb23e");
		ctx.shadowColor = "#ffcf5a";
		ctx.shadowBlur = 12;
		ctx.fillStyle = eg;
		ctx.beginPath();
		ctx.ellipse(ex, ey, 12, 14, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
		ctx.fillStyle = "#1a1030";
		ctx.beginPath();
		ctx.ellipse(ex, ey, 3.8, 11, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "#ffffff";
		ctx.beginPath();
		ctx.arc(ex - 4, ey - 6, 3.2, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.save();
	ctx.fillStyle = "#ff8ccc";
	ctx.strokeStyle = "#ff8ccc";
	ctx.lineJoin = "round";
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(cx - 7, cy + 17);
	ctx.lineTo(cx + 7, cy + 17);
	ctx.lineTo(cx, cy + 25);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

function drawCatPaws(ctx, cx, top) {
	const fur = ctx.createLinearGradient(0, top - 16, 0, top + 20);
	fur.addColorStop(0, "#5a43a0");
	fur.addColorStop(1, "#33265c");
	for (const sd of [-1, 1]) {
		const x = cx + sd * 90, y = top + 1;
		ctx.save();
		ctx.shadowColor = COLORS.pink;
		ctx.shadowBlur = 10;
		ctx.beginPath();
		ctx.ellipse(x, y, 21, 16, 0, 0, Math.PI * 2);
		ctx.fillStyle = fur;
		ctx.fill();
		ctx.lineWidth = 3;
		ctx.strokeStyle = COLORS.pink;
		ctx.stroke();
		ctx.restore();
		ctx.save();
		ctx.strokeStyle = COLORS.lavender;
		ctx.globalAlpha = 0.75;
		ctx.lineWidth = 2.5;
		ctx.lineCap = "round";
		for (const dx of [-7, 0, 7]) {
			ctx.beginPath();
			ctx.moveTo(x + dx, y + 4);
			ctx.lineTo(x + dx, y + 12);
			ctx.stroke();
		}
		ctx.restore();
	}
}

async function renderCard(donorId, ownerId, amount) {
	const [donor, owner, donorImg, ownerImg] = await Promise.all([
		getUser(donorId),
		getUser(ownerId),
		getAvatar(donorId),
		getAvatar(ownerId),
	]);

	const canvas = createCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext("2d");
	const CX = WIDTH / 2;
	const C = { x: 45, y: 118, w: WIDTH - 90, h: 260, r: 32 };
	const cardPath = () => roundRect(ctx, C.x, C.y, C.w, C.h, C.r);

	drawCatHead(ctx, CX, 90);

	const bg = ctx.createLinearGradient(0, C.y, 0, C.y + C.h);
	bg.addColorStop(0, COLORS.cardTop);
	bg.addColorStop(1, COLORS.cardBottom);
	ctx.save();
	ctx.shadowColor = COLORS.violet;
	ctx.shadowBlur = 28;
	cardPath();
	ctx.fillStyle = bg;
	ctx.fill();
	ctx.restore();

	const AV_Y = C.y + 113, AV_R = 66, LX = 145, RX = WIDTH - 145;
	ctx.save();
	cardPath();
	ctx.clip();

	const glass = ctx.createLinearGradient(0, C.y, 0, C.y + C.h * 0.55);
	glass.addColorStop(0, "rgba(255,255,255,0.09)");
	glass.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = glass;
	ctx.fillRect(C.x, C.y, C.w, C.h);

	const spot = ctx.createRadialGradient(CX, AV_Y + 8, 10, CX, AV_Y + 8, 230);
	spot.addColorStop(0, "rgba(255,122,200,0.24)");
	spot.addColorStop(1, "rgba(255,122,200,0)");
	ctx.fillStyle = spot;
	ctx.fillRect(C.x, C.y, C.w, C.h);

	const paws = [[88, 352, 22, -0.5], [805, 152, 22, 0.5], [330, 356, 17, 0.4], [590, 356, 17, -0.3], [255, 150, 15, 0.2], [650, 150, 15, -0.2], [815, 300, 14, 0.3]];
	for (const [x, y, sz, rot] of paws) drawPaw(ctx, x, y, sz, rot, COLORS.lavender, 0.07);

	const sparkles = [[318, 202, 9, "#ffffff", 0.9], [598, 194, 7, COLORS.pink, 0.9], [612, 302, 6, "#ffffff", 0.7], [300, 312, 5, COLORS.pink, 0.8], [270, 160, 5, "#ffffff", 0.6], [640, 158, 6, "#ffffff", 0.6], [80, 170, 4, "#ffffff", 0.5], [825, 345, 5, COLORS.pink, 0.6]];
	for (const [x, y, sz, col, al] of sparkles) drawSparkle(ctx, x, y, sz, col, al);

	cardPath();
	ctx.restore();

	ctx.save();
	roundRect(ctx, C.x + 5, C.y + 5, C.w - 10, C.h - 10, C.r - 5);
	ctx.strokeStyle = "rgba(255,255,255,0.08)";
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.restore();

	const bd = ctx.createLinearGradient(C.x, 0, C.x + C.w, 0);
	bd.addColorStop(0, COLORS.pink);
	bd.addColorStop(0.5, COLORS.violet);
	bd.addColorStop(1, COLORS.pink);
	cardPath();
	ctx.strokeStyle = bd;
	ctx.lineWidth = 3;
	ctx.stroke();

	drawCatPaws(ctx, CX, C.y);

	ctx.fillStyle = COLORS.pink;
	ctx.textBaseline = "alphabetic";
	ctx.font = '15px "PoppinsBold", sans-serif';
	const headW = drawSpaced(ctx, "MEOW DONATIONS", CX, C.y + 52, 6);
	drawPaw(ctx, CX - headW / 2 - 24, C.y + 46, 11, -0.3, COLORS.pink, 1);
	drawPaw(ctx, CX + headW / 2 + 24, C.y + 46, 11, 0.3, COLORS.pink, 1);

	drawWhiskers(ctx, LX, AV_Y, AV_R, 1);
	drawWhiskers(ctx, RX, AV_Y, AV_R, -1);
	drawAvatar(ctx, donorImg, LX, AV_Y, AV_R, donor.displayName[0] || "?");
	drawAvatar(ctx, ownerImg, RX, AV_Y, AV_R, owner.displayName[0] || "?");

	const chipY = AV_Y + AV_R + 2;
	drawChip(ctx, "DONOR", LX, chipY, COLORS.pink, "#c264ff");
	drawChip(ctx, "RECEIVER", RX, chipY, "#a56bff", COLORS.violet);

	for (const [u, cx] of [[donor, LX], [owner, RX]]) {
		ctx.textAlign = "center";
		ctx.textBaseline = "alphabetic";
		ctx.fillStyle = COLORS.white;
		ctx.font = '22px "PoppinsBold", sans-serif';
		let dn = u.displayName;
		while (ctx.measureText(dn).width > 190 && dn.length > 3) dn = dn.slice(0, -1);
		if (dn !== u.displayName) dn += "…";
		ctx.fillText(dn, cx, C.y + 222);
		ctx.fillStyle = COLORS.muted;
		ctx.font = '15px "PoppinsMedium", sans-serif';
		ctx.fillText("@" + u.name, cx, C.y + 245);
	}

	const amountText = amount.toLocaleString("en-US");
	let fontSize = 82;
	ctx.font = `${fontSize}px "PoppinsBold", sans-serif`;
	while (ctx.measureText(amountText).width > 270 && fontSize > 40) {
		fontSize -= 4;
		ctx.font = `${fontSize}px "PoppinsBold", sans-serif`;
	}
	const textW = ctx.measureText(amountText).width;
	const iconR = fontSize * 0.3;
	const gap = 16;
	const groupW = textW + gap + iconR * 2;
	const startX = CX - groupW / 2;
	const baseY = AV_Y + 46;

	const ag = ctx.createLinearGradient(startX, 0, startX + groupW, 0);
	ag.addColorStop(0, "#ff8fd2");
	ag.addColorStop(1, "#b794ff");

	ctx.save();
	ctx.shadowColor = COLORS.pink;
	ctx.shadowBlur = 26;
	ctx.fillStyle = ag;
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillText(amountText, startX, baseY);
	drawRobuxIcon(ctx, startX + textW + gap + iconR, baseY - fontSize * 0.34, iconR, "#b794ff");
	ctx.restore();

	ctx.fillStyle = COLORS.lavender;
	ctx.font = '19px "PoppinsBold", sans-serif';
	const dtY = baseY + 48;
	const dtW = drawSpaced(ctx, "DONATED TO", CX, dtY, 5);
	drawPaw(ctx, CX - dtW / 2 - 22, dtY - 7, 9, -0.3, COLORS.pink, 0.9);
	drawPaw(ctx, CX + dtW / 2 + 22, dtY - 7, 9, 0.3, COLORS.pink, 0.9);

	return canvas.toBuffer("image/png");
}

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const API_KEY = process.env.API_KEY || "";

const app = express();
app.use(express.json({ limit: "10kb" }));

app.get("/", (_req, res) => res.send("OK"));

function validIds(donor, owner, amount) {
	return (
		/^\d{1,15}$/.test(donor) &&
		/^\d{1,15}$/.test(owner) &&
		Number.isInteger(amount) &&
		amount > 0 &&
		amount <= MAX_AMOUNT
	);
}

if (process.env.PREVIEW === "1") {
	app.get("/donation", async (req, res) => {
		const donor = String(req.query.donor || "");
		const owner = String(req.query.owner || "");
		const amount = Number(req.query.amount);
		if (!validIds(donor, owner, amount)) return res.status(400).send("parametres invalides");
		try {
			res.set("Content-Type", "image/png").send(await renderCard(donor, owner, amount));
		} catch (e) {
			console.error(e);
			res.status(500).send("Erreur de generation");
		}
	});
}

app.post("/notify", async (req, res) => {
	if (!API_KEY || req.get("x-api-key") !== API_KEY) return res.status(401).send("non autorise");
	if (!DISCORD_WEBHOOK_URL) return res.status(500).send("webhook non configure");

	const b = req.body || {};
	const donor = String(b.donorId || "");
	const owner = String(b.ownerId || "");
	const amount = Number(b.amount);
	if (!validIds(donor, owner, amount)) return res.status(400).send("parametres invalides");

	try {
		const png = await renderCard(donor, owner, amount);

		const form = new FormData();
		form.append("payload_json", JSON.stringify({ username: "Meow Donations" }));
		form.append("files[0]", new Blob([png], { type: "image/png" }), "donation.png");

		const r = await fetch(DISCORD_WEBHOOK_URL, { method: "POST", body: form, signal: AbortSignal.timeout(10000) });
		if (!r.ok) {
			console.error("Discord a repondu " + r.status + " : " + (await r.text()).slice(0, 200));
			return res.status(502).send("discord error");
		}
		res.send("ok");
	} catch (e) {
		console.error(e);
		res.status(500).send("Erreur");
	}
});

setupFonts().then(() => {
	app.listen(PORT, () => console.log("API prete sur le port " + PORT));
});

module.exports = { renderCard };
