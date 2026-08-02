pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

template CredentialOwnership() {
    signal input holderSecret;        // private: holder's secret key
    signal input credentialHash;      // private: hash of the credential
    signal input ownershipCommitment; // public: Poseidon(holderSecret, credentialHash)
    signal output valid;

    // Verify ownership
    component hasher = Poseidon(2);
    hasher.inputs[0] <== holderSecret;
    hasher.inputs[1] <== credentialHash;
    ownershipCommitment === hasher.out;

    valid <== 1;
}

component main {public [ownershipCommitment]} = CredentialOwnership();
