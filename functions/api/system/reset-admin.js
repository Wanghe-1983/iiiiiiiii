export async function onRequest(context) {
    const { env, request } = context;

    // 支持自定义密码，默认 admin123
    const url = new URL(request.url);
    const password = url.searchParams.get('password') || 'admin123';

    if (!password || password.length < 4) {
        return new Response(JSON.stringify({
            success: false,
            error: '密码至少4位'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
    );
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    const stored = saltHex + ':' + hashHex;

    try {
        await env.INDO_LEARN_DB.prepare(
            `INSERT INTO users (username, password, role, user_type, emp_no, dept, banned, created_at)
             VALUES ('admin', ?, 'admin', 'formal', '000000', '技术部', 0, datetime('now'))
             ON CONFLICT(username) DO UPDATE SET password = excluded.password`
        ).bind(stored).run();

        return new Response(JSON.stringify({
            success: true,
            message: `admin password reset to: ${password}`,
            password: password,
            hash: stored
        }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    } catch (err) {
        return new Response(JSON.stringify({
            success: false,
            error: err.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}