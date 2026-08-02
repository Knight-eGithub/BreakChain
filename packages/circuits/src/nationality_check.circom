pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template NationalityCheck() {
    signal input nationality;       // private: numeric encoding of nationality
    signal input salt;
    signal input nationalityHash;   // public: Poseidon(nationality, salt)
    signal input expectedNationality; // public: the value to check against
    signal output valid;

    // Verify hash commitment
    component hasher = Poseidon(2);
    hasher.inputs[0] <== nationality;
    hasher.inputs[1] <== salt;
    nationalityHash === hasher.out;

    // Equality check
    component eq = IsEqual();
    eq.in[0] <== nationality;
    eq.in[1] <== expectedNationality;
    eq.out === 1;

    valid <== 1;
}

component main {public [nationalityHash, expectedNationality]} = NationalityCheck();
