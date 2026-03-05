/**
 * SemaProof Threat Taxonomy — MITRE ATT&CK & EU AI Act Mapping
 *
 * Pure data module. No side effects, no I/O.
 * Maps each of the 13 threat categories to MITRE technique IDs
 * and relevant EU AI Act articles.
 *
 * @module engine/taxonomy
 */

const TAXONOMY = Object.freeze({
    RANSOMWARE_SIGNATURE: {
        mitre: 'T1486',
        mitre_name: 'Data Encrypted for Impact',
        eu_ai_act: 'Article 15',
        severity: 'CRITICAL'
    },
    PRIVILEGE_ESCALATION: {
        mitre: 'T1548',
        mitre_name: 'Abuse Elevation Control Mechanism',
        eu_ai_act: 'Article 9',
        severity: 'HIGH'
    },
    LATERAL_MOVEMENT: {
        mitre: 'T1021',
        mitre_name: 'Remote Services',
        eu_ai_act: 'Article 9',
        severity: 'HIGH'
    },
    DATA_EXFILTRATION: {
        mitre: 'T1567',
        mitre_name: 'Exfiltration Over Web Service',
        eu_ai_act: 'Article 10',
        severity: 'CRITICAL'
    },
    DESTRUCTIVE_ACTION: {
        mitre: 'T1485',
        mitre_name: 'Data Destruction',
        eu_ai_act: 'Article 15',
        severity: 'CRITICAL'
    },
    KMS_TAMPERING: {
        mitre: 'T1552',
        mitre_name: 'Unsecured Credentials',
        eu_ai_act: 'Article 15',
        severity: 'CRITICAL'
    },
    CREDENTIAL_THEFT: {
        mitre: 'T1528',
        mitre_name: 'Steal Application Access Token',
        eu_ai_act: 'Article 9',
        severity: 'HIGH'
    },
    NETWORK_MANIPULATION: {
        mitre: 'T1557',
        mitre_name: 'Adversary-in-the-Middle',
        eu_ai_act: 'Article 15',
        severity: 'HIGH'
    },
    PERSISTENCE: {
        mitre: 'T1098',
        mitre_name: 'Account Manipulation',
        eu_ai_act: 'Article 9',
        severity: 'MEDIUM'
    },
    OBFUSCATION: {
        mitre: 'T1027',
        mitre_name: 'Obfuscated Files or Information',
        eu_ai_act: 'Article 13',
        severity: 'MEDIUM'
    },
    SEMANTIC_SMUGGLING: {
        mitre: 'T1059',
        mitre_name: 'Command and Scripting Interpreter',
        eu_ai_act: 'Article 13',
        severity: 'HIGH'
    },
    DATA_RESIDENCY_VIOLATION: {
        mitre: 'T1537',
        mitre_name: 'Transfer Data to Cloud Account',
        eu_ai_act: 'Article 10',
        severity: 'HIGH'
    },
    SAFE: {
        mitre: null,
        mitre_name: null,
        eu_ai_act: null,
        severity: 'NONE'
    }
});

/**
 * Look up MITRE and EU AI Act mapping for a threat label.
 *
 * @param {string} label - One of the 13 threat category labels
 * @returns {{ mitre: string|null, eu_ai_act: string|null, severity: string }}
 */
export function lookupThreat(label) {
    return TAXONOMY[label] || { mitre: null, eu_ai_act: null, severity: 'UNKNOWN' };
}

/**
 * Get all known threat categories.
 *
 * @returns {string[]}
 */
export function getCategories() {
    return Object.keys(TAXONOMY);
}

/**
 * Get the full taxonomy (for API responses and documentation).
 *
 * @returns {Object}
 */
export function getTaxonomy() {
    return TAXONOMY;
}
