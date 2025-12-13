import { Request, Response, NextFunction } from "express";
import { db, withRetry } from "./db";
import { admins } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export async function isAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    // Check for admin session (email/password login)
    const adminId = (req.session as any)?.adminId;
    // debug minimal
    if (process.env.DEBUG_AUTH === '1') {
      console.log('[isAdmin] path', req.path, 'adminId', adminId);
    }
    if (adminId) {
      const [admin] = await withRetry(() => 
        db
          .select()
          .from(admins)
          .where(eq(admins.id, adminId))
          .limit(1)
      );
      
      if (admin) {
        (req as any).admin = admin;
        return next();
      }
    }

    // Fallback: Check for Replit Auth with admin role
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userEmail = (req.user as any).claims?.email || (req.user as any).email;
    
    if (!userEmail) {
      return res.status(401).json({ message: "Unauthorized - No email found" });
    }

    const [admin] = await withRetry(() =>
      db
        .select()
        .from(admins)
        .where(eq(admins.email, userEmail))
        .limit(1)
    );

    if (!admin) {
      return res.status(403).json({ message: "Forbidden - Admin access required" });
    }

    (req as any).admin = admin;
    next();
  } catch (error) {
    console.error("Error checking admin status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function verifyAdminPassword(email: string, password: string): Promise<boolean> {
  try {
    const admin = await db
      .select()
      .from(admins)
      .where(eq(admins.email, email))
      .limit(1);

    if (admin.length === 0) {
      return false;
    }

    return await bcrypt.compare(password, admin[0].passwordHash);
  } catch (error) {
    console.error("Error verifying admin password:", error);
    return false;
  }
}
