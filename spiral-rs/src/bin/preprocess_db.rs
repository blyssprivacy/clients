use std::env;
use std::fs::File;
use std::io::Write;

use spiral_rs::server::*;
use spiral_rs::util::*;

fn main() {
    let mut base_params = params_from_json(&CFG_16_100000.replace("'", "\""));

    let args: Vec<String> = env::args().collect();
    let inp_db_path: &String = &args[1];
    let out_db_path: &String = &args[2];

    if args.len() > 2 {
        let target_num_log2: usize = args[3].parse().unwrap();
        let item_size_bytes: usize = args[4].parse().unwrap();

        base_params = get_params_from_store(target_num_log2, item_size_bytes);
    }
    
    let params = &base_params;

    let mut inp_file = File::open(inp_db_path).unwrap();

    let db = load_db_from_seek(params, &mut inp_file);
    let db_slice = db.as_slice();

    let mut out_file = File::create(out_db_path).unwrap();
    for i in 0..db.len() {
        let coeff = db_slice[i];
        out_file.write_all(&coeff.to_ne_bytes()).unwrap();
    }
}
