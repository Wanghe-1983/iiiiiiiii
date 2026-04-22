export const onRequest = async (context) => {
    const { env, request } = context;
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';

    const data = await env.INDO_LEARN_KV.get('all_users');
    const users = data ? JSON.parse(data) : [];

    // 检查是否已有 admin 用户
    const hasAdmin = users.some(u => u.username === 'admin');

    if (force || !hasAdmin) {
        if (!hasAdmin) {
            users.push({
                username: 'admin',
                password: 'admin123',
                name: '系统管理员',
                role: 'admin',
                userType: 'employee',
                companyCode: 'SYS',
                empNo: '000000',
                createdAt: new Date().toISOString(),
            });
            await env.INDO_LEARN_KV.put('all_users', JSON.stringify(users));
        }
        return new Response(JSON.stringify({
            success: true,
            message: hasAdmin && force ? 'admin 已存在，无需重复初始化' : '已初始化默认管理员: admin / admin123',
            userCount: users.length,
            adminExists: true
        }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
        success: true,
        message: 'admin 已存在，跳过初始化',
        userCount: users.length,
        adminExists: true
    }), { headers: { 'Content-Type': 'application/json' } });
};
