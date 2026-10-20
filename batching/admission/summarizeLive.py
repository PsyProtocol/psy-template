"""Verify saved acceptance receipts and report measured intervals, not chain TPS.

Public evidence only. No RPC, signing, retries, or mutation. Fresh output required.
"""
import argparse, datetime, hashlib, json
from pathlib import Path

def read(path):
    return json.loads(path.read_bytes())

def stamp(value):
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()

def ledger(base):
    accepted = {}
    for path in sorted((base / 'attempts').glob('*/included.json')):
        value = read(path)
        if value.get('status') != 'included' or 'preflight' not in value:
            continue  # Deployments and registrations have different receipts.
        pre = value['preflight']
        assert pre.get('fullUpsVerified') is True, str(path)
        core = pre['core']; user = core['new_user_leaf']['user_id']
        assert value['userId'] == user
        assert value['endUserLeafHash'] == core['state_transition']['end_user_leaf_hash']
        receipt = value['receipt']; data = receipt['data']
        assert receipt['success'] is True and data['status'] == 'included'
        assert data['content_hash'] == value['contentHash']
        assert data['included_checkpoint_id'] == value['checkpoint']
        stats = core['stats']; result = data['result']
        fee = stats['guta_fees_collected'] + stats['da_fees_collected']
        assert result['user_id'] == user and result['fees_collected'] == fee
        assert result['slots_modified'] == stats['slots_modified']
        assert result['total_transactions'] == stats['total_transactions']
        key = (user, core['new_user_leaf']['nonce'])
        row = {'attempt': path.parent.name, 'userId': user, 'nonce': key[1],
               'sourceCheckpoint': core['checkpoint_id'],
               'includedCheckpoint': value['checkpoint'],
               'endUserLeafHash': value['endUserLeafHash'],
               'contentHash': value['contentHash'], 'fees': fee,
               'actualCalls': result['total_transactions'],
               'physicalLeavesModified': result['slots_modified'],
               'includedAt': data['included_at'],
               'includedEvidenceSha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        if key in accepted:
            assert accepted[key]['endUserLeafHash'] == row['endUserLeafHash'], 'two results for one nonce'
        else:
            accepted[key] = row
    return list(accepted.values())

def interval(base, round_name):
    done = read(base / f'public/live-{round_name}-complete.json')
    conservation = read(base / f'public/live-{round_name}-conservation.json')
    assert done['ordinaryClaimsIncluded'] and conservation['allUserPayoutsClaimed']
    rows = []
    for market in done['markets']:
        name = f"live-{round_name}-{market['kind']}-settle"
        p = base / 'attempts' / name
        if round_name == 'first' and market['kind'] == 'bondingcurve' and not (p / 'included.json').exists():
            assert read(p / 'failure.json')['broadcastMayHaveBeenAttempted'] is False
            p = base / 'attempts' / (name + '-recovery-v1')
        timing = read(p / 'timing.json'); included = read(p / 'included.json')
        state_path = base / 'public' / (f"live-{round_name}-{market['kind']}-settled.state.json")
        state = read(state_path)
        assert state['fields']['batch_phase'] == [3] and state['fields']['queue_phase'] == [3]
        assert state['fields']['queue_count'] == [2]
        fields = state['fields']; unit = 10**18
        wide = lambda name: fields[name][0] + (fields[name][1] << 62)
        assert fields['consumed'] == ([1, 1] if round_name == 'first' else [2, 2])
        if market['kind'] == 'amm':
            output = (2*unit*9970*100*unit) // (100*unit*10000 + 2*unit*9970)
            assert wide('reserve_a') == 100*unit - (output if round_name == 'refund' else 0)
            assert wide('reserve_b') == (100 if round_name == 'first' else 102)*unit
            assert wide('total_shares') == 100*unit
        if market['kind'] == 'bondingcurve':
            sold = 15 if round_name == 'first' else 14
            assert fields['phase'] == [1] and fields['sold_lots'] == [sold]
            assert wide('quote_reserve') == unit*sold + 10**16*sold*(sold-1)//2
        rows.append({**market, 'clientStartedAt': timing['startedAt'],
                     'clientWallMilliseconds': timing['wallMilliseconds'],
                     'includedAt': included['receipt']['data']['included_at'],
                     'checkedAt': included['checkedAt'],
                     'contentHash': included['contentHash'],
                     'actualCalls': included['preflight']['core']['stats']['total_transactions'],
                     'settledQueueRoot': state['fields']['queue_root'],
                     'terminalOutcomes': state['fields']['queue_outcome'][:2],
                     'settledStateRoots': state['roots'],
                     'terminalNoncesAndFixtureEconomicStateVerified': True,
                     'settledStateEvidenceSha256': hashlib.sha256(state_path.read_bytes()).hexdigest()})
    begin = min(stamp(r['clientStartedAt']) for r in rows)
    end = max(stamp(r['includedAt']) for r in rows)
    seconds = end - begin
    assert seconds > 0
    return {'round': round_name, 'fullIntervalStart': done['startedAt'],
            'fullIntervalEnd': done['completedAt'],
            'fullIntervalMilliseconds': done['wallMilliseconds'],
            'terminalOrderDispositions': done['terminalOrderDispositions'],
            'economicTrades': done['economicTrades'], 'liquidityAdds': done['liquidityAdds'],
            'refundedOrders': done['refundedOrders'],
            'settlementWaveSeconds': seconds,
            'observedTradesPerSecondDuringWave': done['economicTrades'] / seconds,
            'observedTerminalOrdersPerSecondDuringWave': done['terminalOrderDispositions'] / seconds,
            'observedTerminalOrdersPerSecondFullInterval': done['terminalOrderDispositions'] * 1000 / done['wallMilliseconds'],
            'scope': 'one four-vault QA wave, two accepted members each; cold clients, RPC and proof work overlap; wave excludes intake/commit/timeout/claim work; full interval includes it; neither is chain capacity or a controlled prover comparison',
            'settlements': rows, 'conservation': conservation}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--base', type=Path, required=True)
    p.add_argument('--nft-replacement', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    assert not a.out.exists(), 'fresh output required'
    rounds = [interval(a.base, name) for name in ['first', 'refund']]
    replacement = read(a.nft_replacement / 'public/nft-v2-complete.json')
    assert replacement['missingSellerRefundAndOrdinaryClaim']
    assert replacement['sameListingSubsequentUniqueSale']
    ledgers = {'pairedFourMarketFixture': ledger(a.base), 'nftReplacement': ledger(a.nft_replacement)}
    races = []
    for kind in ['amm', 'orderbook', 'bondingcurve', 'nftmarket']:
        r = read(a.base / f'public/live-first-{kind}-race-result.json')
        assert r['fullProofCandidates'] == 2 and r['assertedSingleAdmission']
        assert r['loserRetryAllowed'] is False
        races.append({'market': kind, 'winner': r['winner']['actor'],
                      'winningContentHash': r['winner']['receipt']['contentHash'],
                      'fullProofCandidates': 2, 'scope': 'live competing admissions for one vault nonce; not simultaneous settlement/cancellation broadcasts'})
    result = {'schema': 1, 'scope': 'saved public real staging testnet acceptance; new QA FT/NFT assets and real test PSY, not existing pUSDT',
              'markets': rounds[0]['settlements'], 'rounds': rounds,
              'nftReplacement': replacement, 'races': races, 'acceptedUps': ledgers,
              'originalTransferAckLossRecovery': read(a.base / 'public/real-ack-loss-recovery-v1.json'),
              'deterministicOrdering': True, 'globalMarketCompleteness': False,
              'randomOrderingEnabled': False, 'chainCapacityMeasured': False,
              'runningImageAttested': False, 'upgradeAuthorizationVerified': False,
              'productionReady': False, 'nodeModified': False}
    with a.out.open('x') as f:
        json.dump(result, f, indent=2); f.write('\n')
    print(json.dumps({'report': str(a.out), 'uniqueIncludedUps': {k: len(v) for k, v in ledgers.items()}}))

if __name__ == '__main__':
    main()
