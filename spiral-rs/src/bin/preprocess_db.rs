use std::env;
use std::fs::File;
use std::io::Write;
use std::slice::from_raw_parts;

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

    let db = load_db_from_seek(params, inp_db_path);

    println!("Done preprocessing. Outputting...");

    let mut out_file = File::create(out_db_path).unwrap();
    let output_as_u8_slice = unsafe {
        from_raw_parts(db.as_ptr() as *const u8, db.len() * 8)
    };
    out_file.write_all(output_as_u8_slice).unwrap();
}
