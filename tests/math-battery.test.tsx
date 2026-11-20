import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { ToolContentResponse, MessageResponse } from "../components/ai-elements/message.tsx";

const R = String.raw;
const cases: Record<string, string> = {
	reported: R`Soit $f$ les vecteurs
$$u_1 = \begin{pmatrix} 1 \\ 0 \end{pmatrix}, \qquad
u_2 = \begin{pmatrix} 0 \\ 1 \end{pmatrix}.$$
Quelle est la dimension ?`,
	oneLineMidPara: R`les vecteurs $$u = \begin{pmatrix}1\\2\end{pmatrix}$$ donc libre`,
	oneLineOwnLine: R`On a
$$\begin{cases} x & \text{si } x>0 \\ -x & \text{sinon} \end{cases}$$
donc.`,
	bracketMulti: R`On pose \[
A = \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}
\] et on calcule.`,
	closeOnTextLine: R`Calculer
$$
u = \begin{pmatrix} 1 \\ 2 \end{pmatrix}.$$
Ensuite.`,
	openOnTextLine: R`Calculer
$$u = \begin{pmatrix} 1 \\ 2 \end{pmatrix}
$$
Ensuite.`,
	textAfterClose: R`$$
x = 1
$$ donc fini.`,
	listItem: R`1. On a
   $$
   A = \begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix}
   $$
2. Ensuite`,
	inlineMatrix: R`La matrice $\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix}$ est inversible.`,
	parenInline: R`Soit \(A = \begin{bmatrix}1\\2\end{bmatrix}\) un vecteur.`,
	interval: R`$f$ est continue sur $]0,1[$ et sur $[0, 1]$.`,
	accents: R`$\text{déterminant} = \det(A)$ et $\operatorname{rg}(A) = 2$`,
	rowSpacing: R`$$
\begin{pmatrix} 1 \\[2pt] 2 \end{pmatrix}
$$`,
	align: R`$$
\begin{align} a &= b \\ c &= d \end{align}
$$`,
	aligned: R`$$
\begin{aligned} a &= b \\ c &= d \end{aligned}
$$`,
	array: R`$$
\left(\begin{array}{cc|c} 1 & 2 & 3 \\ 4 & 5 & 6 \end{array}\right)
$$`,
	vmatrix: R`$\begin{vmatrix} a & b \\ c & d \end{vmatrix} = ad - bc$`,
	tableNorm: R`| x | norme |
|---|---|
| $u$ | $\|u\|$ |`,
	blockquote: R`> $$
> x^2
> $$`,
	unicode: R`$x ≤ 2$ et $λ ∈ ℝ$`,
	dollars: R`Ça coûte 5$ et 10$.`,
	systemSingleLine: R`$$\left\{\begin{array}{l} x + y = 1 \\ x - y = 0 \end{array}\right.$$`,
	textWithBackslashNewline: R`Le système $\begin{cases} x+y=1 \\ x-y=0 \end{cases}$ a une solution.`,
	doubleBackslashEscaped: R`$\\frac{1}{2}$ et $\\mathbb{R}^n$`,
	nestedDollarInText: R`$$
\text{pour } x = 1
$$`,
	numberedFence: R`Étape 1 :
$$\det(A) = 1 \cdot 4 - 2 \cdot 3
= -2$$`,
};
test("typical model math renders without KaTeX errors or raw TeX", () => {
const failures: string[] = [];
for (const [name, src] of Object.entries(cases)) {
	for (const [label, el] of [
		["tool", <ToolContentResponse key="t" mode="static" controls={false} isAnimating={false} linkSafety={{ enabled: false }}>{src}</ToolContentResponse>],
		["msg", <MessageResponse key="m" mode="static" controls={false} isAnimating={false} linkSafety={{ enabled: false }}>{src}</MessageResponse>],
	] as const) {
		const html = renderToStaticMarkup(el);
		const doc = parseHTML(`<html><body>${html}</body></html>`).document;
		const errors = [...doc.querySelectorAll(".katex-error")].map(e => e.getAttribute("title") ?? e.textContent);
		const k = doc.querySelectorAll(".katex").length;
		for (const n of doc.querySelectorAll(".katex,pre,code")) n.remove();
		const leftover = /\\begin|\\end|\$\$|\\\[|\\\(|\\frac|\\mathbb/.exec(doc.body.textContent ?? "");
		const bad = errors.length || leftover;
		if (bad) failures.push(`${label} ${name} katex=${k}${errors.length ? " err=" + JSON.stringify(errors).slice(0, 160) : ""}${leftover ? " leftover=" + JSON.stringify((doc.body.textContent ?? "").slice(Math.max(0, leftover.index - 30), leftover.index + 50)) : ""}`);
	}
}
assert.deepEqual(failures, []);
});
