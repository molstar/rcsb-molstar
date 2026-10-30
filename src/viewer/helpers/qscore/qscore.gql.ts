export const qscore_gql = /* GraphQL */ `
query QScore($entry_id: String!) {
    entry(entry_id: $entry_id) {
        polymer_entities {
            polymer_entity_instances {
                rcsb_polymer_entity_instance_container_identifiers {
                    asym_id
                }
                rcsb_polymer_instance_feature {
                    type
                    feature_positions {
                        beg_seq_id
                        values
                    }
                }
            }
        }
        nonpolymer_entities {
            nonpolymer_entity_instances {
                rcsb_nonpolymer_entity_instance_container_identifiers {
                    asym_id
                }
                rcsb_nonpolymer_instance_validation_score {
                    Q_score
                }
            }
        }
    }
}
`;
