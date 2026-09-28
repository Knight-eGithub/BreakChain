pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template AgeOver() {
    signal input age;
    signal input salt;
    signal input ageHash;       // public: Poseidon(age, salt)
    signal input ageThreshold;  // public: minimum age required
    signal output valid;

    // Verify the hash commitment
    component hasher = Poseidon(2);
    hasher.inputs[0] <== age;
    hasher.inputs[1] <== salt;
    ageHash === hasher.out;

    // Range check: age >= ageThreshold
    component gte = GreaterEqThan(8); // 8-bit comparison (0-255)
    gte.in[0] <== age;
    gte.in[1] <== ageThreshold;
    gte.out === 1;

    valid <== 1;
}

component main {public [ageHash, ageThreshold]} = AgeOver();
