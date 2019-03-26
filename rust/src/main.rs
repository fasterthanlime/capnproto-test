extern crate capnp;

use std::fs;

pub mod frames_capnp {
    include!(concat!("./frames_capnp.rs"));
}

pub mod calculator_capnp {
    include!(concat!("./calculator_capnp.rs"));
}

fn frames_main() -> ::capnp::Result<()> {
    use capnp::serialize;
    let mut f = fs::File::open("data.bin")?;
    let message_reader = serialize::read_message(&mut f, ::capnp::message::ReaderOptions::new())?;
    let root = message_reader.get_root::<frames_capnp::frames::Reader>()?;
    let frame = root
        .get_frames()?
        .iter()
        .nth(0)
        .expect("wanted at least one frame");
    match frame.which() {
        Ok(frames_capnp::frame::AudioFrame(af)) => {
            let af = af?;
            println!("stream ID: {}", af.get_stream_id());
            println!("channels: {}", af.get_channels());
            {
                let pts = af.get_pts()?;
                println!("pts: {}", pts.get_num() as f64 / pts.get_den() as f64);
            }
            println!("data: {:?}", af.get_data()?);
        }
        _ => println!("Was not an audio frame"),
    }
    Ok(())
}

fn client_main() -> ::capnp::Result<()> {
    Err(::capnp::Error {
        kind: ::capnp::ErrorKind::Failed,
        description: "unimplemented".to_string(),
    })
}

fn main() {
    let args: Vec<String> = ::std::env::args().collect();
    let cmd = &args[1];
    match cmd.as_ref() {
        "frames" => frames_main(),
        "client" => client_main(),
        _ => panic!(format!("unknown command {}", cmd)),
    }
    .expect("command failed")
}
