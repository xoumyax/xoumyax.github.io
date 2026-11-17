import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractText, getDocumentProxy } from 'unpdf';
import { checkText } from '../../src/lib/claims';

async function pdfText(path: string) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text, totalPages };
}

test.each(['public/Soumyajyoti_Dutta_Resume.pdf', 'public/Soumyajyoti_Dutta_CV.pdf'])('%s passes the claims guard', async (p) => {
  const { text } = await pdfText(p);
  expect(checkText(text, p, { pdf: true })).toEqual([]);
});

test('one-pager names the owner; CV is at least two pages', async () => {
  expect((await pdfText('public/Soumyajyoti_Dutta_Resume.pdf')).text).toContain('Soumyajyoti Dutta');
  expect((await pdfText('public/Soumyajyoti_Dutta_CV.pdf')).totalPages).toBeGreaterThanOrEqual(2);
});
