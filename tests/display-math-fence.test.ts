import { test } from "node:test";
import assert from "node:assert/strict";
import { transformMathDelimiters } from "../src/core/math-delims.ts";

test("multi-line $$ with text on the fence lines gets its own fence lines", () => {
	const src = String.raw`Soit $f$ les vecteurs
$$u_1 = \begin{pmatrix} 1 \\ 0 \end{pmatrix}, \qquad
u_2 = 3.$$
Quelle $f$ ?`;
	const want = String.raw`Soit $f$ les vecteurs
$$
u_1 = \begin{pmatrix} 1 \\ 0 \end{pmatrix}, \qquad
u_2 = 3.
$$
Quelle $f$ ?`;
	assert.equal(transformMathDelimiters(src), want);
});

test("already fenced and single-line display math stay as they are", () => {
	for (const src of ["a\n$$\nx\n$$\nb", "a $$x$$ b", "$$x$$"]) assert.equal(transformMathDelimiters(src), src);
});
