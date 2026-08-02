# ZKP Circuits

This package contains the circom circuits used by the Breakchain ZKP SDK.

- `age_over.circom`: Proves `age >= threshold` without revealing actual age. Uses Poseidon hash commitment.
- `nationality_check.circom`: Proves citizenship matches a known value without revealing other fields.
- `credential_ownership.circom`: Proves holder owns a credential bound to their DID.

## Prerequisites
- circom v2.x must be installed (`cargo install circom`)

## Build Commands
```bash
# Compile circuit
circom src/age_over.circom --r1cs --wasm --sym -o build/age_over

# Trusted setup (Powers of Tau)
snarkjs powersoftau new bn128 12 pot12_0000.ptau
snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="First contribution"
snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau

# Groth16 setup
snarkjs groth16 setup build/age_over/age_over.r1cs pot12_final.ptau build/age_over/age_over.zkey
snarkjs zkey export verificationkey build/age_over/age_over.zkey build/age_over/verification_key.json
```

Note that pre-built artifacts will be committed once compiled.
