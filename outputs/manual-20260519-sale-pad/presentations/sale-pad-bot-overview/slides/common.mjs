export const W = 1280;
export const H = 720;

export const C = {
  ink: "#12211f",
  muted: "#5f6f6a",
  faint: "#dce7e1",
  paper: "#f6f3ec",
  white: "#ffffff",
  teal: "#0f8f7f",
  tealDark: "#07675d",
  mint: "#cbeee5",
  coral: "#ff7a5f",
  gold: "#f1c453",
  blue: "#315f9d",
  slate: "#243b3a",
  gray: "#edf1ed",
};

export function bg(slide, ctx, fill = C.paper) {
  ctx.addShape(slide, { x: 0, y: 0, w: W, h: H, fill });
}

export function title(slide, ctx, kicker, headline, sub = "") {
  ctx.addText(slide, {
    text: kicker,
    x: 64,
    y: 52,
    w: 520,
    h: 26,
    fontSize: 15,
    bold: true,
    color: C.tealDark,
  });
  ctx.addText(slide, {
    text: headline,
    x: 64,
    y: 92,
    w: 790,
    h: sub ? 104 : 120,
    fontSize: 46,
    bold: true,
    color: C.ink,
  });
  if (sub) {
    ctx.addText(slide, {
      text: sub,
      x: 66,
      y: 198,
      w: 710,
      h: 58,
      fontSize: 19,
      color: C.muted,
    });
  }
}

export function footer(slide, ctx, page) {
  ctx.addShape(slide, { x: 64, y: 662, w: 1152, h: 1.5, fill: "#cfdad4" });
  ctx.addText(slide, {
    text: "Sale Pad Discord Bot",
    x: 64,
    y: 675,
    w: 360,
    h: 24,
    fontSize: 13,
    color: C.muted,
  });
  ctx.addText(slide, {
    text: String(page).padStart(2, "0"),
    x: 1168,
    y: 675,
    w: 48,
    h: 24,
    fontSize: 13,
    bold: true,
    color: C.tealDark,
    align: "right",
  });
}

export function pill(slide, ctx, text, x, y, w, color = C.teal, textColor = C.white) {
  ctx.addShape(slide, {
    x,
    y,
    w,
    h: 34,
    fill: color,
    line: ctx.line(color, 1),
  });
  ctx.addText(slide, {
    text,
    x: x + 12,
    y: y + 7,
    w: w - 24,
    h: 20,
    fontSize: 13,
    bold: true,
    color: textColor,
    align: "center",
  });
}

export function metric(slide, ctx, value, label, x, y, w, accent = C.teal) {
  ctx.addShape(slide, { x, y, w, h: 118, fill: C.white, line: ctx.line(C.faint, 1) });
  ctx.addShape(slide, { x, y, w: 8, h: 118, fill: accent });
  ctx.addText(slide, { text: value, x: x + 24, y: y + 22, w: w - 44, h: 42, fontSize: 34, bold: true, color: C.ink });
  ctx.addText(slide, { text: label, x: x + 24, y: y + 70, w: w - 44, h: 34, fontSize: 15, color: C.muted });
}

export function card(slide, ctx, heading, body, x, y, w, h, accent = C.teal) {
  ctx.addShape(slide, { x, y, w, h, fill: C.white, line: ctx.line(C.faint, 1) });
  ctx.addShape(slide, { x, y, w, h: 5, fill: accent });
  ctx.addText(slide, { text: heading, x: x + 22, y: y + 24, w: w - 44, h: 34, fontSize: 20, bold: true, color: C.ink });
  ctx.addText(slide, { text: body, x: x + 22, y: y + 68, w: w - 44, h: h - 96, fontSize: 14, color: C.muted });
}

export function node(slide, ctx, heading, sub, x, y, w, h, fill = C.white, accent = C.teal) {
  ctx.addShape(slide, { x, y, w, h, fill, line: ctx.line(C.faint, 1) });
  ctx.addShape(slide, { x, y, w: 7, h, fill: accent });
  ctx.addText(slide, { text: heading, x: x + 22, y: y + 16, w: w - 36, h: 26, fontSize: 18, bold: true, color: C.ink });
  ctx.addText(slide, { text: sub, x: x + 22, y: y + 50, w: w - 36, h: h - 72, fontSize: 12.5, color: C.muted });
}

export function line(slide, ctx, x, y, w, h = 3, fill = C.teal) {
  ctx.addShape(slide, { x, y, w, h, fill });
}

export function smallLabel(slide, ctx, text, x, y, w, color = C.muted) {
  ctx.addText(slide, { text, x, y, w, h: 24, fontSize: 13, bold: true, color });
}
