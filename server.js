const express = require("express");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 3000;
const WIDTH = 900;
const HEIGHT = 350;
const COLORS = {
	card: "#1c1e26",
	accent: "#1e7bff",
	white: "#ffffff",
	grey: "#8a8d99",
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

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function drawAvatar(ctx, img, cx, cy, r, initial) {
	ctx.save();
	ctx.shadowColor = COLORS.accent;
	ctx.shadowBlur = 30;
	ctx.beginPath();
	ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
	ctx.fillStyle = COLORS.accent;
	ctx.fill();
	ctx.restore();

	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
	ctx.clip();
	if (img) {
		ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
	} else {
		ctx.fillStyle = "#33363f";
		ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
		ctx.fillStyle = COLORS.grey;
		ctx.font = '60px "PoppinsBold", sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(initial, cx, cy + 4);
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
}

function drawRobuxIcon(ctx, cx, cy, size) {
	ctx.save();
	ctx.strokeStyle = COLORS.accent;
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
	ctx.fillStyle = COLORS.accent;
	ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
	ctx.restore();
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

	ctx.save();
	ctx.shadowColor = COLORS.accent;
	ctx.shadowBlur = 25;
	roundRect(ctx, 45, 35, WIDTH - 90, HEIGHT - 70, 28);
	ctx.fillStyle = COLORS.card;
	ctx.fill();
	ctx.restore();
	roundRect(ctx, 45, 35, WIDTH - 90, HEIGHT - 70, 28);
	ctx.strokeStyle = COLORS.accent;
	ctx.lineWidth = 3;
	ctx.stroke();

	drawAvatar(ctx, donorImg, 155, 140, 70, donor.displayName[0] || "?");
	drawAvatar(ctx, ownerImg, WIDTH - 155, 140, 70, owner.displayName[0] || "?");

	for (const [u, cx] of [[donor, 155], [owner, WIDTH - 155]]) {
		ctx.textAlign = "center";
		ctx.textBaseline = "alphabetic";
		ctx.fillStyle = COLORS.white;
		ctx.font = '22px "PoppinsBold", sans-serif';
		let dn = u.displayName;
		while (ctx.measureText(dn).width > 190 && dn.length > 3) dn = dn.slice(0, -1);
		if (dn !== u.displayName) dn += "…";
		ctx.fillText(dn, cx, 246);
		ctx.fillStyle = COLORS.grey;
		ctx.font = '15px "PoppinsMedium", sans-serif';
		ctx.fillText("@" + u.name, cx, 272);
	}

	const amountText = amount.toLocaleString("en-US");
	let fontSize = 84;
	ctx.font = `${fontSize}px "PoppinsBold", sans-serif`;
	while (ctx.measureText(amountText).width > 300 && fontSize > 40) {
		fontSize -= 4;
		ctx.font = `${fontSize}px "PoppinsBold", sans-serif`;
	}
	const textW = ctx.measureText(amountText).width;
	const iconR = fontSize * 0.32;
	const gap = 16;
	const groupW = textW + gap + iconR * 2;
	const startX = WIDTH / 2 - groupW / 2;

	ctx.save();
	ctx.shadowColor = COLORS.accent;
	ctx.shadowBlur = 22;
	ctx.fillStyle = COLORS.accent;
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillText(amountText, startX, 175);
	ctx.restore();
	drawRobuxIcon(ctx, startX + textW + gap + iconR, 175 - fontSize * 0.34, iconR);

	ctx.fillStyle = COLORS.accent;
	ctx.font = '22px "PoppinsBold", sans-serif';
	drawSpaced(ctx, "DONATED TO", WIDTH / 2, 226, 4);

	return canvas.toBuffer("image/png");
}

const app = express();

app.get("/", (_req, res) => res.send("Donation image API OK"));

app.get("/donation", async (req, res) => {
	const donor = String(req.query.donor || "");
	const owner = String(req.query.owner || "");
	const amount = Number(req.query.amount);

	if (!/^\d{1,15}$/.test(donor) || !/^\d{1,15}$/.test(owner)) {
		return res.status(400).send("donor et owner doivent etre des UserId valides");
	}
	if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
		return res.status(400).send("amount invalide");
	}

	try {
		const png = await renderCard(donor, owner, amount);
		res.set("Content-Type", "image/png");
		res.set("Cache-Control", "public, max-age=86400");
		res.send(png);
	} catch (e) {
		console.error(e);
		res.status(500).send("Erreur de generation");
	}
});

setupFonts().then(() => {
	app.listen(PORT, () => console.log("API prete sur le port " + PORT));
});

module.exports = { renderCard };
