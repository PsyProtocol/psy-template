// Darwin /usr/bin/time -l observations. Peak RSS is bytes on this platform.
// This is a process peak, not the sum of overlapping process peaks.
export function darwinResourceUsage(log) {
 const one = re => { const matches = [...log.matchAll(re)]; if (matches.length !== 1) throw Error('missing or ambiguous resource observation'); return Number(matches[0][1]); };
 const peakResidentBytes = one(/^\s*(\d+)\s+maximum resident set size\s*$/gm);
 const realSeconds = one(/^\s*([\d.]+) real\s+[\d.]+ user\s+[\d.]+ sys\s*$/gm);
 if (!Number.isSafeInteger(peakResidentBytes) || peakResidentBytes <= 0 || !Number.isFinite(realSeconds) || realSeconds <= 0) throw Error('invalid resource observation');
 return {platform: 'darwin', peakResidentBytes, realSeconds, scope: 'one timed proof process including cold resources and both full UPSs; not concurrent host peak, GPU memory or per-phase RSS'};
}
