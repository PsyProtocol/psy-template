// No entropy provider is accepted by this frozen release. Parsing or checkpoint
// membership never supplies the missing uniqueness/unpredictability guarantee.
const fields=['seed','randomSeed','randomSource','randomness','randomnessProof','randomSeedProof','beacon','beaconProof','drawCheckpoint','randomRound','randomOrdering','seedCommitment'];
export function assertDeterministicOrdering(config){
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('batch configuration required');
 if(config.ordering!==undefined&&config.ordering!=='deterministic')throw Error('authenticated future randomness is unavailable; deterministic only');
 for(const key of fields)if(Object.hasOwn(config,key))throw Error('randomness dependency not attested: '+key);
}
export function requireQualifiedRandomSource(){
 const error=Error('No qualified random source or pre-draw seal-inclusion verifier is installed; preserve deterministic profile');
 error.code='RANDOM_SOURCE_UNAVAILABLE';throw error;
}
