# Contract 64 staging multiuser tests — 2026-09-30

Network: Psy Sepolia staging. Amounts are token base units. This test used the already deployed orderbook contract `64` and SD-key escrow user `591872`; no contract was updated or deployed.

## Participants and funding

Two new, independent ZK users were registered: pUSDT seller `1640448` (C) and PSY seller `329728` (D). Together with the existing test users `1454080` (A) and `929792` (B), the run covered four registered users. Wallet secrets remain in ignored, mode-0600 local files under `.secrets/` and are not included in this report.

A transferred `10,000,000,000` test PSY to each new user and `500,000` test pUSDT to C in transaction `780ec571235621c0957043682f39d6beb05efa9adde8a465c84418d3e9f8082d`, confirmed at checkpoint `88486`. C claimed both tokens in `bfb2e9697733edfdd0a8c6b8054e9d174c2561cbcf9bbdbcdb75c37d4713cb4b` (checkpoint `88498`); D claimed PSY in `30d9d0154b029c0bc30990c4c5986c627bc3f2b1dc1b21a60005ad8df694660f` (checkpoint `88500`). Chain state at checkpoint `88500` showed C with `8,999,996,000` PSY and `500,000` pUSDT, and D with `8,999,998,000` PSY. The PSY difference from the transfer is transaction fees.

The initial funding proof attempt failed before submission when the staging prover returned HTTP 502. It produced no transaction hash. The retry above was the only confirmed funding transaction.

## Different-price match with new users

| Step | Transaction | Confirmed checkpoint | Chain result |
| --- | --- | ---: | --- |
| D opens a PSY order: sell `400,000`, receive at least `200,000` pUSDT, nonce `1` | `12acef25e4a53e42a093794f1aae71d66e71b944099c8d047edad26579a266a6` | `88514` | Exact PSY amount and fee escrow paid |
| C opens a pUSDT order: sell `200,000`, receive at least `300,000` PSY, nonce `1` | `9dfbbc4fa472d00dadf8e30785f456802b0294f62b7b647155d1919c8454b7b2` | `88516` | Exact pUSDT amount and PSY fee escrow paid |
| Public SD-key wallet matches `400,000` PSY for `200,000` pUSDT | `122eb34aebf6798bab1e5c12ee04dca40f82e67d267e3c5d23a8d8a710efea4e` | by `88547` | Escrow consumed nonce `1` for both sellers; transferred `1,000,500,000` PSY to C, including return of C's PSY fee escrow, and `200,000` pUSDT to D |
| C claims PSY and closes its order | `214e4377c95d9dd10bc8a09acc230bca6a9c634775087e89e39786fc1a5a439c` | `88560` | C's order slot is `0` |
| D claims pUSDT and closes its order | `39ba0f54f8885ecbc8a195e9be1204ba056cfeffa76aa4b925e164855c2320a1` | `88560` | D's order slot is `0` |

Both opening transactions were started concurrently from separate users and both confirmed. The full six-call match stack passed `ORDERBOOK_PROVE_ONLY=1` before signing and submission. At checkpoint `88560`, C had `300,000` pUSDT and `7,000,386,000` PSY; D had `200,000` pUSDT. These checks cover independent users and simultaneous order creation, but do not establish a throughput limit for many matching requests against the shared escrow.

## Second order and same-seller cancellation

C reused its released slot with a higher nonce. Its `100,000` pUSDT sell order (minimum `150,000` PSY, nonce `2`) was confirmed in `fdf2d1b4dac020d6b0ecada318075a812c2e17c59c6aa18defab7aab44cb3852` at checkpoint `88575`. The full six-call cancellation and refund stack passed `ORDERBOOK_PROVE_ONLY=1`; the public SD-key wallet then submitted `28073e88fead587482ab7e735676ad577a646e632bc5ba23e8dc3575a9f6aa61`. By checkpoint `88603`, the escrow's consumed nonce for C had advanced from `1` to `2`, and its pUSDT Outbox recorded exactly `100,000` sent to C.

C claimed that refund and closed the order in `c30e286e1c51a839cd5bcc77b67b4cbce6c32985d81943b58088a4d4c5d8fa1e`, confirmed at checkpoint `88615`. At that checkpoint, C's pUSDT balance was back to `300,000`, its pUSDT claim cursor from escrow was `100,000`, and its order slot was `0`. Unrelated user B's pUSDT balance was `1,000,000` at both checkpoints `88500` and `88615`.

All final values above were read from on-chain Merkle proofs. A final chain health read showed checkpoint `88629` and `next_contract_id=65`, so block production continued. The tests did not use contracts `62` or `63`, modify psy-node, or push local code.
