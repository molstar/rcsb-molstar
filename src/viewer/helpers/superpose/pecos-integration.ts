import { Mat4 } from 'molstar/lib/mol-math/linear-algebra';

const ALIGNMENT_URL = 'https://alignment.rcsb.org/api/v1-beta/';

// TODO probably move to selection.ts
export type Residue = { label_asym_id: string, struct_oper_id?: string, label_seq_id: number };
export type MotifSelection = { entry_id: string, residue_ids: Residue[] }
export type MotifAlignmentRequest = {
    query: {
        entry_id: string,
        residue_ids: Residue[]
    },
    hits: ({
        id: string,
        assembly_id: string,
    } & MotifSelection)[]
}

export async function alignMotifs(query: MotifSelection, hit: MotifSelection): Promise<{ rmsd: number, matrix: Mat4 }> {
    const q = {
        options: {
            return_sequence_data: false
        },
        context: {
            mode: 'pairwise',
            method: {
                name: 'qcp',
                parameters: {
                    atom_pairing_strategy: 'all'
                }
            },
            structures: [
                {
                    entry_id: query.entry_id,
                    residue_ids: convertToPecosIdentifiers(query.residue_ids)
                },
                {
                    entry_id: hit.entry_id,
                    residue_ids: convertToPecosIdentifiers(hit.residue_ids)
                }
            ]
        }
    };

    const formData = new FormData();
    formData.append('query', JSON.stringify(q));

    const r = await fetch(ALIGNMENT_URL + 'structures/submit', { method: 'POST', body: formData });

    if (r.status !== 200) {
        throw new Error('Failed to submit the job');
    }

    const uuid = await r.text();
    const url = ALIGNMENT_URL + 'structures/results?uuid=' + uuid;
    // polls every 25ms for up to 10 seconds
    const result = await pollUntilDone(url, 25, 10 * 1000);

    const { alignment_summary, blocks } = result.results[0];
    return { rmsd: alignment_summary.scores[0].value, matrix: blocks[0].transformations[0] };
}

// convert strucmotif/arches residue identifiers to the pecos/sierra flavor
function convertToPecosIdentifiers(identifiers: Residue[]) {
    return identifiers.map(i => {
        const o = Object.create(null);
        Object.assign(o, {
            asym_id: i.label_asym_id,
            seq_id: i.label_seq_id
        });
        if (i.struct_oper_id) Object.assign(o, { struct_oper_id: i.struct_oper_id });
        return o;
    });
}

// create a promise that resolves after a short delay
function delay(t: number) {
    return new Promise(function(resolve) {
        setTimeout(resolve, t);
    });
}

/**
 * Poll until results are available.
 * @param url is the URL to request
 * @param interval is how often to poll
 * @param timeout is how long to poll waiting for a result (0 means try forever)
 */
async function pollUntilDone(url: string, interval: number, timeout: number) {
    const start = Date.now();
    async function run(): Promise<any> {
        const r = await fetch(url);
        const data = await r.json();
        if (data.info.status === 'COMPLETE') {
            // we know we're done here, return from here whatever you
            // want the final resolved value of the promise to be
            return data;
        } else if (data.info.status === 'ERROR') {
            throw new Error('Failed to complete the job. Error: ' + data.info.message);
        } else {
            if (timeout !== 0 && Date.now() - start > timeout) {
                throw new Error('timeout error on pollUntilDone');
            } else {
                // run again with a short delay
                return delay(interval).then(run);
            }
        }
    }
    return run();
}