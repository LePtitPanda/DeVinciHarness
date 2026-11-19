'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { parseIcs, between, formatEvent } = require('../src/ics.cjs');
const { createMoodle, flatten, stripHtml } = require('../src/moodle.cjs');
const { parseLaunchUrl } = require(path.join(__dirname, '../../../electron/devinci.cjs'));

const ICS = [
  'BEGIN:VCALENDAR', 'BEGIN:VTIMEZONE', 'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'END:DAYLIGHT', 'END:VTIMEZONE',
  'BEGIN:VEVENT', 'SUMMARY:[MESIMA110225]Algèbre [Examen]', 'DTSTART:20261128T094500', 'DTEND:20261128T104500',
  'LOCATION:PARC-A403 (44),PARC-A404 (44),PARC-A405 (44),PARC-A406 (44)', 'TITLE:Algèbre', 'TYPECOURS:Examen', 'END:VEVENT',
  'BEGIN:VEVENT', 'SUMMARY:[X]Mécanique [CM]DUPONT', 'DTSTART:20261120T081500', 'DTEND:20261120T094500', 'LOCATION:PÔLE-AMPHI-C (2', ' 50)', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('ics: only VEVENTs, sorted, exams flagged, folded lines joined', () => {
  const events = parseIcs(ICS);
  assert.equal(events.length, 2);
  assert.equal(events[0].start, '2026-11-20T08:15');
  assert.equal(events[0].title, 'Mécanique');
  assert.equal(events[0].type, 'CM');
  assert.equal(events[0].location, 'PÔLE-AMPHI-C (250)');
  assert.equal(events[1].exam, true);
  assert.equal(between(events, '2026-11-21T00:00', '2026-12-01T00:00').length, 1);
  assert.match(formatEvent(events[1]), /4 rooms \(whole year group\)/);
});

test('moodle: write functions are blocked before any request', async () => {
  let requests = 0;
  const m = createMoodle({ getToken: async () => 'a'.repeat(32), fetchImpl: async () => { requests++; return new Response('{}'); } });
  await assert.rejects(m.call('mod_assign_save_submission', {}), /Blocked/);
  await assert.rejects(m.call('core_message_send_instant_messages', {}), /Blocked/);
  assert.equal(requests, 0);
});

test('moodle: downloads only from the school web-service file path', async () => {
  const seen = [];
  const m = createMoodle({ getToken: async () => 'tok', fetchImpl: async (url) => { seen.push(String(url)); return new Response('x'); } });
  await assert.rejects(m.download('https://evil.example/webservice/pluginfile.php/1/a.pdf'), /Only De Vinci/);
  await assert.rejects(m.download('https://learning.devinci.fr/webservice/pluginfile.php/../../login/logout.php'), /Only De Vinci/);
  await m.download('https://learning.devinci.fr/webservice/pluginfile.php/12/mod_resource/content/1/cours.pdf');
  assert.deepEqual(seen, ['https://learning.devinci.fr/webservice/pluginfile.php/12/mod_resource/content/1/cours.pdf?token=tok']);
});

test('moodle: PHP-style params and HTML stripping', () => {
  assert.equal(flatten({ courseids: [3, 4], a: 1 }).toString(), 'courseids%5B0%5D=3&courseids%5B1%5D=4&a=1');
  assert.equal(stripHtml('<p>Exam: ch. 3&amp;4</p><p>Bring&nbsp;a pen</p>'), 'Exam: ch. 3&4\nBring a pen');
});

test('sign-in: accepts only a launch result signed for this passport', () => {
  const token = 'f'.repeat(32), passport = '12345';
  const sig = crypto.createHash('md5').update('https://learning.devinci.fr' + passport).digest('hex');
  const url = (s) => `moodlemobile://token=${Buffer.from(`${s}:::${token}:::private`).toString('base64')}`;
  assert.equal(parseLaunchUrl(url(sig), passport), token);
  assert.throws(() => parseLaunchUrl(url(sig), '99999'), /could not be verified/);
});
