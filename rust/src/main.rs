extern crate capnp;
extern crate capnp_rpc;
extern crate tokio;

use std::fs;

pub mod frames_capnp {
    include!(concat!("./frames_capnp.rs"));
}

pub mod calculator_capnp {
    include!(concat!("./calculator_capnp.rs"));
}

fn frames_main() -> Result<(), Box<dyn std::error::Error>> {
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

fn client_main() -> Result<(), Box<dyn std::error::Error>> {
    use calculator_capnp::calculator;
    use capnp_rpc::{rpc_twoparty_capnp, twoparty, RpcSystem};
    use futures::Future;
    use tokio::io::AsyncRead;

    // Set up async runtime
    let mut runtime = ::tokio::runtime::current_thread::Runtime::new()?;

    // Establish TCP connection to server
    let addr = "127.0.0.1:9494";
    println!("Connecting to server on {}", addr);
    let connect_attempt = ::tokio::net::TcpStream::connect(&addr.parse()?);
    let stream = runtime.block_on(connect_attempt)?;
    stream.set_nodelay(true)?;
    let (reader, writer) = stream.split();

    // Set up capnp RPC
    let network = Box::new(twoparty::VatNetwork::new(
        reader,
        std::io::BufWriter::new(writer), // for performance (flush between messages)
        rpc_twoparty_capnp::Side::Client, // we are a client
        Default::default(),              // no receive options
    ));
    let mut rpc_system = RpcSystem::new(network, None);

    // "Bootstrap capabilities", that's cap'n proto stuff.
    let _calculator: calculator::Client = rpc_system.bootstrap(rpc_twoparty_capnp::Side::Server);

    // Spawn RPC system in the background
    runtime.spawn(rpc_system.map_err(|e| println!("Encountered error: {}", e)));

    panic!("at the disco")
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
