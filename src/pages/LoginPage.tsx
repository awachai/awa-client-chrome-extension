
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { Bot, User, Lock, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [httpTunnel, setHttpTunnel] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login, isLoading, error, clearError } = useAuth();

  // ฟังก์ชั่นส่ง log ไปยัง background script
  const logToContent = (message: string, level: string = 'log') => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'LOG_TO_CONTENT',
        message: `[LOGIN_DEBUG] ${message}`,
        level: level
      });
    } else {
      console.log(`[LOGIN_DEBUG] ${message}`);
    }
  };

  logToContent('LoginPage rendered');
  logToContent(`Auth state: ${JSON.stringify({ isLoading, error })}`);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    logToContent('Form submitted');
    logToContent(`Credentials: ${JSON.stringify({ 
      username, 
      password: password ? '***' : 'empty',
      http_tunnel: httpTunnel
    })}`);
    
    clearError();

    if (!username || !password) {
      logToContent('Missing credentials');
      toast({
        title: "ข้อมูลไม่ครบถ้วน",
        description: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน",
        variant: "destructive",
      });
      return;
    }

    logToContent('Calling login function...');
    try {
      const result = await login({ username, password, http_tunnel: httpTunnel });
      logToContent(`Login result: ${JSON.stringify(result)}`);

      if (result.success) {
        logToContent('Login successful, navigating to chat');
        toast({
          title: "เข้าสู่ระบบสำเร็จ",
          description: "ยินดีต้อนรับเข้าสู่ AI Web Agent",
        });
        navigate('/chat');
      } else {
        logToContent(`Login failed: ${result.error}`);
        toast({
          title: "เข้าสู่ระบบไม่สำเร็จ",
          description: result.error || "กรุณาตรวจสอบชื่อผู้ใช้และรหัสผ่าน",
          variant: "destructive",
        });
      }
    } catch (err) {
      logToContent(`Login error: ${err}`, 'error');
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่อีกครั้ง",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <Bot className="h-12 w-12 text-blue-600 mx-auto" />
          <CardTitle className="text-2xl font-kanit">เข้าสู่ระบบ</CardTitle>
          <CardDescription>
            กรุณาเข้าสู่ระบบเพื่อใช้งาน AI Web Agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">ชื่อผู้ใช้</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="username"
                  type="text"
                  placeholder="ชื่อผู้ใช้"
                  value={username}
                  onChange={(e) => {
                    logToContent(`Username changed: ${e.target.value}`);
                    setUsername(e.target.value);
                  }}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    logToContent(`Password changed: ${e.target.value ? '***' : 'empty'}`);
                    setPassword(e.target.value);
                  }}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="httpTunnel">HTTP Tunnel (ไม่บังคับ)</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="httpTunnel"
                  type="text"
                  placeholder="http://example.com"
                  value={httpTunnel}
                  onChange={(e) => {
                    logToContent(`HTTP Tunnel changed: ${e.target.value}`);
                    setHttpTunnel(e.target.value);
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
            <Button 
              type="submit" 
              className="w-full font-kanit" 
              disabled={isLoading}
              onClick={() => logToContent('Button clicked')}
            >
              {isLoading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
