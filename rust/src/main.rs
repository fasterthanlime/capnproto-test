extern crate capnp;

use std::fs;

pub mod frames_capnp {
    include!(concat!("./frames_capnp.rs"));
}

fn read_data() -> ::capnp::Result<()> {
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

fn main() {
    read_data().expect("reading capnp payload failed")
}
