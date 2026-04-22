export const onRequest = async (context) => {
    const { env } = context;

    // 内联获取所有用户
    const keys = await env.KV.list({ prefix: 'user:' });
    const users = [];
    for (const key of keys.keys) {
        const data = await env.KV.get(key.name, 'json');
        if (data) users.push(data);
    }

    if (users.length === 0) {
        // 首次访问：初始化默认超级管理员
        const adminUser = {
            username: 'admin',
            password: 'admin123',
            name: '系统管理员',
            role: 'admin',
            userType: 'employee',
            companyCode: 'SYS',
            empNo: '000000',
            verified: true,
            createdAt: new Date().toISOString(),
        };
        await env.KV.put('user:admin', JSON.stringify(adminUser));

        return new Response(JSON.stringify({
            success: true,
            message: '已初始化默认管理员: admin / admin123',
            userCount: 1
        }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
        success: true,
        message: '已有用户，跳过初始化',
        userCount: users.length
    }), { headers: { 'Content-Type': 'application/json' } });
};
