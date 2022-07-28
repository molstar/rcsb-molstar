export const resolution_gql = /* GraphQL */ `
query Resolution($entry_id: String!) {
    entry(entry_id: $entry_id) {
        rcsb_entry_info {
          resolution_combined
        }
    }
}
`;