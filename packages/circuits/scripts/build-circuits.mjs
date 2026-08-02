#!/usr/bin/env node
/**
 * Circuit Build Script — Compiles Circom circuits and runs Groth16 trusted setup.
 *
 * Prerequisites:
 *   - circom CLI installed (https://docs.circom.io/getting-started/installation/)
 *   - snarkjs (installed via npm)
 *
 * Outputs (per circuit):
 *   - build/<name>.r1cs          — constraint system
 *   - build/<name>.sym           — symbol table
 *   - build/<name>_js/<name>.wasm — WASM witness calculator
 *   - build/<name>.zkey          — proving key (Groth16)
 *   - build/<name>_vkey.json     — verification key
 *
 * Usage: node scripts/build-circuits.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUILD = join(ROOT, 'build');
const SRC = join(ROOT, 'src');
const NODE_MODULES = join(ROOT, '..', '..', 'node_modules');
const PTAU_FILE = join(BUILD, 'pot12.ptau');

const CIRCUITS = ['age_over', 'nationality_check', 'credential_ownership'];

function run(cmd, cwd = ROOT) {
  console.log(`  > ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function main() {
  console.log('=== Breakchain Circuit Build ===\n');

  // Ensure build dir
  if (!existsSync(BUILD)) mkdirSync(BUILD, { recursive: true });

  // Step 1: Powers of Tau (shared ceremony)
  if (!existsSync(PTAU_FILE)) {
    console.log('[1/4] Generating Powers of Tau (2^12 = 4096 constraints)...');
    run(`npx snarkjs powersoftau new bn128 12 "${join(BUILD, 'pot12_0000.ptau')}" -v`);
    console.log('[1/4] Contributing randomness...');
    run(`npx snarkjs powersoftau contribute "${join(BUILD, 'pot12_0000.ptau')}" "${join(BUILD, 'pot12_0001.ptau')}" --name="breakchain-demo" -e="breakchain-random-entropy-${Date.now()}"`);
    console.log('[1/4] Preparing phase 2...');
    run(`npx snarkjs powersoftau prepare phase2 "${join(BUILD, 'pot12_0001.ptau')}" "${PTAU_FILE}" -v`);
    console.log('[1/4] Powers of Tau complete.\n');
  } else {
    console.log('[1/4] Powers of Tau already exists, skipping.\n');
  }

  // Step 2-4: Per-circuit setup
  for (const name of CIRCUITS) {
    console.log(`\n--- Circuit: ${name} ---`);
    const r1cs = join(BUILD, `${name}.r1cs`);
    const circSrc = join(SRC, `${name}.circom`);

    // Step 2: Compile (if not already done)
    if (!existsSync(r1cs)) {
      console.log(`[2/4] Compiling ${name}.circom...`);
      run(`circom "${circSrc}" --r1cs --wasm --sym -o "${BUILD}" -l "${NODE_MODULES}"`, join(ROOT, '..', '..'));
    } else {
      console.log(`[2/4] ${name}.r1cs already exists, skipping compilation.`);
    }

    // Step 3: Groth16 setup
    const zkey0 = join(BUILD, `${name}_0000.zkey`);
    const zkeyFinal = join(BUILD, `${name}.zkey`);
    console.log(`[3/4] Groth16 setup for ${name}...`);
    run(`npx snarkjs groth16 setup "${r1cs}" "${PTAU_FILE}" "${zkey0}"`);

    // Contribute randomness
    console.log(`[3/4] Contributing randomness to ${name} zkey...`);
    run(`npx snarkjs zkey contribute "${zkey0}" "${zkeyFinal}" --name="breakchain-${name}" -e="entropy-${name}-${Date.now()}"`);

    // Step 4: Export verification key
    const vkey = join(BUILD, `${name}_vkey.json`);
    console.log(`[4/4] Exporting verification key for ${name}...`);
    run(`npx snarkjs zkey export verificationkey "${zkeyFinal}" "${vkey}"`);

    console.log(`--- ${name} complete ---`);
  }

  console.log('\n=== All circuits built successfully! ===');
  console.log(`Artifacts in: ${BUILD}`);
}

main();
