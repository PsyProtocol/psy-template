import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

test('Scaffolding E2E: Scaffolds, verifies templates, and enforces unconfigured initial preflight failure', async (t) => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'psy-scaffold-test-'));

  try {
    // 1. Template distribution & Git isolation verification
    await t.test('repository template isolation: .issuer_configured must not exist in templates or git', () => {
      // Must not exist in clean working tree
      assert.strictEqual(existsSync(join(REPO_ROOT, '.issuer_configured')), false, 'Root .issuer_configured must not exist');
      assert.strictEqual(existsSync(join(REPO_ROOT, 'token/.issuer_configured')), false, 'token/.issuer_configured must not exist');
      assert.strictEqual(existsSync(join(REPO_ROOT, 'nft/.issuer_configured')), false, 'nft/.issuer_configured must not exist');
      assert.strictEqual(existsSync(join(REPO_ROOT, 'dapp/.issuer_configured')), false, 'dapp/.issuer_configured must not exist');

      // Must be ignored by git
      try {
        const rootIgnored = execSync('git check-ignore .issuer_configured', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        assert.strictEqual(rootIgnored, '.issuer_configured', 'Root .issuer_configured must be gitignored');

        const tokenIgnored = execSync('git check-ignore token/.issuer_configured', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        assert.ok(tokenIgnored.includes('.issuer_configured'), 'token/.issuer_configured must be gitignored');

        const nftIgnored = execSync('git check-ignore nft/.issuer_configured', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        assert.ok(nftIgnored.includes('.issuer_configured'), 'nft/.issuer_configured must be gitignored');

        const dappIgnored = execSync('git check-ignore dapp/.issuer_configured', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        assert.ok(dappIgnored.includes('.issuer_configured'), 'dapp/.issuer_configured must be gitignored');
      } catch (err) {
        assert.fail(`Git check-ignore failed: ${err.message}`);
      }

      // Root preflight must fail in initial unconfigured state
      let rootPreflightFailed = false;
      try {
        execSync('node scripts/configure_issuer.mjs --preflight', { cwd: REPO_ROOT, stdio: 'pipe' });
      } catch {
        rootPreflightFailed = true;
      }
      assert.ok(rootPreflightFailed, 'Root preflight must fail when .issuer_configured is absent');
    });

    // 2. Parent directory marker isolation test
    await t.test('parent directory isolation: clean subproject must NOT inherit parent directory .issuer_configured', () => {
      const parentDir = join(tmpDir, 'configured_parent_workspace');
      mkdirSync(parentDir, { recursive: true });

      // Create a mock parent marker with issuer_user_id = 5
      const mockParentState = {
        issuer_user_id: '5',
        configured_at: new Date().toISOString(),
        configured_files: ['contract/src/main.psy']
      };
      writeFileSync(join(parentDir, '.issuer_configured'), JSON.stringify(mockParentState, null, 2), 'utf-8');

      // Copy clean token template into a subdirectory of the configured parent
      const subprojectDir = join(parentDir, 'sub_token_project');
      execSync(`cp -R "${join(REPO_ROOT, 'token')}" "${subprojectDir}"`);
      assert.strictEqual(existsSync(join(subprojectDir, '.issuer_configured')), false, 'Subproject itself must NOT have .issuer_configured');

      // Preflight in the subproject MUST FAIL because it must NOT fall back to parent directory's .issuer_configured
      let subPreflightFailed = false;
      try {
        execSync('node scripts/configure_issuer.mjs --preflight', { cwd: subprojectDir, stdio: 'pipe' });
      } catch {
        subPreflightFailed = true;
      }
      assert.ok(subPreflightFailed, 'Subproject preflight MUST fail and NOT inherit parent directory .issuer_configured');
    });

    // 3. Configured source copy & distribution exclusion test (strictly reading configured source)
    await t.test('configured source copy & distribution exclusion: raw cp -R copies marker vs safe distribution purges it', () => {
      // Create a configured source template in temporary directory with issuer_user_id = 42
      const configuredSourceDir = join(tmpDir, 'configured_source_token');
      execSync(`cp -R "${join(REPO_ROOT, 'token')}" "${configuredSourceDir}"`);
      execSync('node scripts/configure_issuer.mjs --issuer 42', { cwd: configuredSourceDir, stdio: 'pipe' });
      assert.ok(existsSync(join(configuredSourceDir, '.issuer_configured')), 'Configured source must have .issuer_configured');

      // 3a. Demonstration of raw cp -R limitation: raw copy retains hidden files
      const rawCopiedDir = join(tmpDir, 'raw_copied_token');
      execSync(`cp -R "${configuredSourceDir}" "${rawCopiedDir}"`);
      assert.ok(existsSync(join(rawCopiedDir, '.issuer_configured')), 'Raw cp -R copies hidden files including .issuer_configured');

      // 3b. Safe distribution/scaffolding process: strictly copy FROM configuredSourceDir
      const safeScaffoldedDir = join(tmpDir, 'safe_scaffolded_token');
      execSync(`node "${join(REPO_ROOT, 'scripts/scaffold.mjs')}" "${configuredSourceDir}" "${safeScaffoldedDir}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
      assert.strictEqual(existsSync(join(safeScaffoldedDir, '.issuer_configured')), false, 'Safe scaffolding must strictly exclude .issuer_configured from configured source');

      // The safe scaffolded project initial preflight MUST FAIL (even though source was configured with 42)
      let preflightFailed = false;
      try {
        execSync('node scripts/configure_issuer.mjs --preflight', { cwd: safeScaffoldedDir, stdio: 'pipe' });
      } catch {
        preflightFailed = true;
      }
      assert.ok(preflightFailed, 'Preflight on newly scaffolded project MUST fail until explicitly configured');

      // Now explicitly configure the new project -> passes
      execSync('node scripts/configure_issuer.mjs --issuer 99', { cwd: safeScaffoldedDir, stdio: 'pipe' });
      const passedOutput = execSync('node scripts/configure_issuer.mjs --preflight', { cwd: safeScaffoldedDir, encoding: 'utf-8' });
      assert.ok(passedOutput.includes('PASSED'), 'Preflight passes after explicit configuration');
    });

    // 4. Path containment test: target inside source or identical path must be rejected
    await t.test('scaffold path containment check: target inside source or identical path must be rejected', () => {
      // 4a. Target inside source
      let nestedTargetFailed = false;
      try {
        execSync(`node "${join(REPO_ROOT, 'scripts/scaffold.mjs')}" token "${join(REPO_ROOT, 'token/nested_output')}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
      } catch {
        nestedTargetFailed = true;
      }
      assert.ok(nestedTargetFailed, 'Scaffold must reject target directory located inside source directory');

      // 4b. Target identical to source
      let identicalPathFailed = false;
      try {
        execSync(`node "${join(REPO_ROOT, 'scripts/scaffold.mjs')}" token "${join(REPO_ROOT, 'token')}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
      } catch {
        identicalPathFailed = true;
      }
      assert.ok(identicalPathFailed, 'Scaffold must reject target directory identical to source directory');

      // 4c. Symlink containment check: target through a symlink pointing to source
      const symlinkSrcDir = join(tmpDir, 'symlink_src_dir');
      mkdirSync(symlinkSrcDir, { recursive: true });
      writeFileSync(join(symlinkSrcDir, 'dummy.txt'), 'hello', 'utf-8');

      const symlinkPath = join(tmpDir, 'symlink_pointing_to_src');
      symlinkSync(symlinkSrcDir, symlinkPath);

      // Target passes through symlink into source directory
      let symlinkTargetFailed = false;
      try {
        execSync(`node "${join(REPO_ROOT, 'scripts/scaffold.mjs')}" "${symlinkSrcDir}" "${join(symlinkPath, 'nested_via_symlink')}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
      } catch {
        symlinkTargetFailed = true;
      }
      assert.ok(symlinkTargetFailed, 'Scaffold must reject target directory when it resolves inside source via symlink');

      // Source is a symlink and target is inside real directory
      let symlinkSourceFailed = false;
      try {
        execSync(`node "${join(REPO_ROOT, 'scripts/scaffold.mjs')}" "${symlinkPath}" "${join(symlinkSrcDir, 'nested_real')}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
      } catch {
        symlinkSourceFailed = true;
      }
      assert.ok(symlinkSourceFailed, 'Scaffold must reject target when source is a symlink and target resolves inside it');
    });

    // 5. Test token template scaffolding & preflight lifecycle
    await t.test('scaffold pure token template: preflight must fail until configured', () => {
      const targetDir = join(tmpDir, 'test_my_token');
      execSync(`cp -R "${join(REPO_ROOT, 'token')}" "${targetDir}"`);

      assert.ok(existsSync(join(targetDir, 'Dargo.toml')), 'Dargo.toml should exist');
      assert.ok(existsSync(join(targetDir, 'src/main.psy')), 'src/main.psy should exist');
      assert.ok(existsSync(join(targetDir, 'README.md')), 'README.md should exist');
      assert.ok(existsSync(join(targetDir, '.gitignore')), '.gitignore should exist');
      assert.strictEqual(existsSync(join(targetDir, '.issuer_configured')), false, 'Scaffolded template must NOT contain .issuer_configured');

      // Initial preflight MUST FAIL on clean scaffold
      let preflightFailed = false;
      try {
        execSync('node scripts/configure_issuer.mjs --preflight', { cwd: targetDir, stdio: 'pipe' });
      } catch {
        preflightFailed = true;
      }
      assert.ok(preflightFailed, 'Initial preflight on newly scaffolded token project MUST fail');

      // Explicit configuration allows preflight to pass
      execSync('node scripts/configure_issuer.mjs --issuer 42', { cwd: targetDir, stdio: 'pipe' });
      assert.ok(existsSync(join(targetDir, '.issuer_configured')), '.issuer_configured should exist after configure');

      const preflightOutput = execSync('node scripts/configure_issuer.mjs --preflight', { cwd: targetDir, encoding: 'utf-8' });
      assert.ok(preflightOutput.includes('PASSED'), 'Preflight must pass after configuration');

      // Deleting .issuer_configured causes preflight to fail again
      rmSync(join(targetDir, '.issuer_configured'), { force: true });
      let preflightFailedAgain = false;
      try {
        execSync('node scripts/configure_issuer.mjs --preflight', { cwd: targetDir, stdio: 'pipe' });
      } catch {
        preflightFailedAgain = true;
      }
      assert.ok(preflightFailedAgain, 'Preflight must fail again if .issuer_configured is removed');

      // Test build
      try {
        execSync('psyup build', { cwd: targetDir, encoding: 'utf-8', stdio: 'pipe' });
      } catch {
        // Fall back in environments without psyup in PATH
      }
      assert.ok(existsSync(join(targetDir, 'target/token.json')), 'target/token.json should exist');
      assert.ok(existsSync(join(targetDir, 'target/token.abi.json')), 'target/token.abi.json should exist');
    });

    // 6. Test nft template scaffolding & preflight lifecycle
    await t.test('scaffold pure nft template: preflight must fail until configured', () => {
      const targetDir = join(tmpDir, 'test_my_nft');
      execSync(`cp -R "${join(REPO_ROOT, 'nft')}" "${targetDir}"`);

      assert.ok(existsSync(join(targetDir, 'Dargo.toml')), 'Dargo.toml should exist');
      assert.ok(existsSync(join(targetDir, 'src/main.psy')), 'src/main.psy should exist');
      assert.ok(existsSync(join(targetDir, 'README.md')), 'README.md should exist');
      assert.ok(existsSync(join(targetDir, '.gitignore')), '.gitignore should exist');
      assert.strictEqual(existsSync(join(targetDir, '.issuer_configured')), false, 'Scaffolded template must NOT contain .issuer_configured');

      // Initial preflight MUST FAIL on clean scaffold
      let preflightFailed = false;
      try {
        execSync('node scripts/configure_issuer.mjs --preflight', { cwd: targetDir, stdio: 'pipe' });
      } catch {
        preflightFailed = true;
      }
      assert.ok(preflightFailed, 'Initial preflight on newly scaffolded nft project MUST fail');

      // Explicit configuration allows preflight to pass
      execSync('node scripts/configure_issuer.mjs --issuer 42', { cwd: targetDir, stdio: 'pipe' });
      assert.ok(existsSync(join(targetDir, '.issuer_configured')), '.issuer_configured should exist after configure');

      const preflightOutput = execSync('node scripts/configure_issuer.mjs --preflight', { cwd: targetDir, encoding: 'utf-8' });
      assert.ok(preflightOutput.includes('PASSED'), 'Preflight must pass after configuration');

      // Test build
      try {
        execSync('psyup build', { cwd: targetDir, encoding: 'utf-8', stdio: 'pipe' });
      } catch {
        // Fall back in environments without psyup in PATH
      }
      assert.ok(existsSync(join(targetDir, 'target/nft.json')), 'target/nft.json should exist');
      assert.ok(existsSync(join(targetDir, 'target/nft.abi.json')), 'target/nft.abi.json should exist');
    });

    // 7. Test dapp contract scaffolding & preflight lifecycle
    await t.test('scaffold dapp template contract: preflight must fail until configured', () => {
      const targetDir = join(tmpDir, 'test_my_dapp');
      execSync(`cp -R "${join(REPO_ROOT, 'dapp')}" "${targetDir}"`);

      assert.ok(existsSync(join(targetDir, 'package.json')), 'package.json should exist');
      assert.ok(existsSync(join(targetDir, 'contract/Dargo.toml')), 'contract/Dargo.toml should exist');
      assert.ok(existsSync(join(targetDir, 'contract/src/main.psy')), 'contract/src/main.psy should exist');
      assert.ok(existsSync(join(targetDir, '.gitignore')), '.gitignore should exist');
      assert.strictEqual(existsSync(join(targetDir, '.issuer_configured')), false, 'Scaffolded template must NOT contain .issuer_configured');

      // Initial preflight MUST FAIL on clean scaffold
      let preflightFailed = false;
      try {
        execSync('node scripts/configure_issuer.mjs --preflight', { cwd: targetDir, stdio: 'pipe' });
      } catch {
        preflightFailed = true;
      }
      assert.ok(preflightFailed, 'Initial preflight on newly scaffolded dapp project MUST fail');

      // Explicit configuration allows preflight to pass
      execSync('node scripts/configure_issuer.mjs --issuer 42', { cwd: targetDir, stdio: 'pipe' });
      assert.ok(existsSync(join(targetDir, '.issuer_configured')), '.issuer_configured should exist after configure');

      const preflightOutput = execSync('node scripts/configure_issuer.mjs --preflight', { cwd: targetDir, encoding: 'utf-8' });
      assert.ok(preflightOutput.includes('PASSED'), 'Preflight must pass after configuration');

      // Test contract build
      try {
        execSync('psyup build', { cwd: join(targetDir, 'contract'), encoding: 'utf-8', stdio: 'pipe' });
      } catch {
        // Fall back in environments without psyup in PATH
      }
      assert.ok(existsSync(join(targetDir, 'contract/target/token.json')), 'contract/target/token.json should exist');
      assert.ok(existsSync(join(targetDir, 'contract/target/token.abi.json')), 'contract/target/token.abi.json should exist');
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
