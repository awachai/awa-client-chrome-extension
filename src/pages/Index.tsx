
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Bot, Zap, Shield } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Bot className="h-16 w-16 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 font-kanit">AI Web Agent</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            ตัวช่วย AI ที่ช่วยควบคุมและทำงานกับบราวเซอร์ของคุณอย่างอัตโนมัติ
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <Zap className="h-8 w-8 text-blue-600 mb-2" />
              <CardTitle className="font-kanit">ควบคุมอัตโนมัติ</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                สั่งงาน AI ให้ช่วยทำงานต่างๆ บนเว็บไซต์แทนคุณ
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Bot className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle className="font-kanit">AI Assistant</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                สนทนาด้วยข้อความ ส่งรูปภาพ หรือเอกสารเพื่อสั่งงาน
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 text-purple-600 mb-2" />
              <CardTitle className="font-kanit">ปลอดภัย</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                ระบบยืนยันตัวตนและการรักษาความปลอดภัย
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Button 
            onClick={() => navigate('/login')} 
            size="lg"
            className="px-8 py-3 text-lg font-kanit"
          >
            เริ่มใช้งาน
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
