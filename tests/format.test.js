import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatDuration, formatSeconds } from '../src/core/format.js';

test('formatNumber: plain integers below 100k', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(7), '7');
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(1234), '1,234');
  assert.equal(formatNumber(99999), '99,999');
  assert.equal(formatNumber(12.9), '12', 'floors non-integers');
});

test('formatNumber: compact tiers', () => {
  assert.equal(formatNumber(100000), '100K');
  assert.equal(formatNumber(150000), '150K');
  assert.equal(formatNumber(1234567), '1.23M');
  assert.equal(formatNumber(12345678), '12.3M');
  assert.equal(formatNumber(999999999), '1B', 'boundary rounding bumps tier');
  assert.equal(formatNumber(4200000000), '4.2B');
  assert.equal(formatNumber(7.5e15), '7.5Qa');
});

test('formatNumber: signs and junk', () => {
  assert.equal(formatNumber(-250), '-250');
  assert.equal(formatNumber(-1234567), '-1.23M');
  assert.equal(formatNumber(NaN), '—');
  assert.equal(formatNumber(undefined), '—');
  assert.equal(formatNumber(Infinity), '∞');
});

test('formatDuration buckets', () => {
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(-5), '0s');
  assert.equal(formatDuration(45_500), '45s');
  assert.equal(formatDuration(60_000), '1m 00s');
  assert.equal(formatDuration(271_000), '4m 31s');
  assert.equal(formatDuration(7_260_000), '2h 01m');
  assert.equal(formatDuration(97_200_000), '1d 3h');
});

test('formatSeconds shows tenths for action bars', () => {
  assert.equal(formatSeconds(0), '0.0s');
  assert.equal(formatSeconds(3_400), '3.4s');
  assert.equal(formatSeconds(6500), '6.5s');
});
