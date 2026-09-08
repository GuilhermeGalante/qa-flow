fn main() {
    // O ícone do executável Windows é incorporado durante o build. Sem esta
    // dependência explícita, `tauri dev` pode reutilizar um binário debug com
    // a identidade anterior mesmo depois de `icons/icon.ico` ser regenerado.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::build()
}
