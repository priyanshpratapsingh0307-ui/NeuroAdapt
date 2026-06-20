import os
import glob

routers_dir = r"C:\Users\pkd95\Documents\neuroadapt\NeuroAdapt\backend\app\routers"
for f_path in glob.glob(os.path.join(routers_dir, "*.py")):
    with open(f_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    if "x_user_id" in content:
        content = content.replace("x_user_id: str = Header(...)", "user_id: str = Depends(get_current_user)")
        content = content.replace("x_user_id", "user_id")
        if "get_current_user" not in content and "from app.routers.users import get_current_user" not in content:
            content = "from app.routers.users import get_current_user\nfrom fastapi import Depends\n" + content
        
        with open(f_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated {f_path}")
