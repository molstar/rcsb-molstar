export const resolution_gql = /* GraphQL */ `
query Resolution($entry_id: String!) {
    entry(entry_id: $entry_id) {
        refine {
          ls_d_res_high
        }
    }
}
`;