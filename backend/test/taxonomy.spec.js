/**
 * SemaProof Threat Taxonomy — Spec
 *
 * Tests the MITRE ATT&CK and EU AI Act mapping for all 13 threat categories.
 */

import { lookupThreat, getCategories, getTaxonomy } from '../src/engine/taxonomy.js';

describe('Threat Taxonomy', () => {

    test('should provide exactly 13 threat categories', () => {
        const categories = getCategories();
        expect(categories).toHaveLength(13);
    });

    test('should map RANSOMWARE_SIGNATURE to MITRE T1486', () => {
        const threat = lookupThreat('RANSOMWARE_SIGNATURE');
        expect(threat.mitre).toBe('T1486');
        expect(threat.severity).toBe('CRITICAL');
    });

    test('should map DATA_EXFILTRATION to MITRE T1567', () => {
        const threat = lookupThreat('DATA_EXFILTRATION');
        expect(threat.mitre).toBe('T1567');
        expect(threat.eu_ai_act).toBe('Article 10');
    });

    test('should map CREDENTIAL_THEFT to MITRE T1528', () => {
        const threat = lookupThreat('CREDENTIAL_THEFT');
        expect(threat.mitre).toBe('T1528');
        expect(threat.eu_ai_act).toBe('Article 9');
    });

    test('should return null MITRE for SAFE label', () => {
        const threat = lookupThreat('SAFE');
        expect(threat.mitre).toBeNull();
        expect(threat.severity).toBe('NONE');
    });

    test('should return UNKNOWN for unrecognized labels', () => {
        const threat = lookupThreat('NONEXISTENT_CATEGORY');
        expect(threat.severity).toBe('UNKNOWN');
    });

    test('every threat category should have a MITRE mapping except SAFE', () => {
        const taxonomy = getTaxonomy();
        for (const [label, entry] of Object.entries(taxonomy)) {
            if (label === 'SAFE') {
                expect(entry.mitre).toBeNull();
            } else {
                expect(entry.mitre).toBeTruthy();
                expect(entry.mitre).toMatch(/^T\d+$/);
            }
        }
    });

    test('every non-SAFE category should have an EU AI Act article', () => {
        const taxonomy = getTaxonomy();
        for (const [label, entry] of Object.entries(taxonomy)) {
            if (label === 'SAFE') {
                expect(entry.eu_ai_act).toBeNull();
            } else {
                expect(entry.eu_ai_act).toBeTruthy();
                expect(entry.eu_ai_act).toContain('Article');
            }
        }
    });
});
