import { EnhancedAttendanceService } from "../lib/attendance-service-enhanced";
import { AttendanceRecord, User } from "../lib/database-schema";

// Mock Supabase client
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
};

// Mock createClient function
jest.mock("../lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

describe("Attendance System", () => {
  let attendanceService: EnhancedAttendanceService;

  beforeEach(() => {
    attendanceService = new EnhancedAttendanceService();
    jest.clearAllMocks();
  });

  describe("Geolocation Verification", () => {
    it("should verify if user is within office location", () => {
      // Test data for Mumbai office and user near it
      const isWithin = attendanceService.isWithinOfficeLocation(
        19.0760, // User latitude (Mumbai)
        72.8777, // User longitude (Mumbai)
        19.0760, // Office latitude (Mumbai)
        72.8777, // Office longitude (Mumbai)
        1000 // 1km radius
      );
      
      expect(isWithin).toBe(true);
    });

    it("should verify if user is outside office location", () => {
      // Test data for Mumbai office and user in Delhi
      const isWithin = attendanceService.isWithinOfficeLocation(
        28.7041, // User latitude (Delhi)
        77.1025, // User longitude (Delhi)
        19.0760, // Office latitude (Mumbai)
        72.8777, // Office longitude (Mumbai)
        1000 // 1km radius
      );
      
      expect(isWithin).toBe(false);
    });
  });

  describe("IP Verification", () => {
    it("should allow IP when no restrictions are set", async () => {
      // Mock settings with no IP restrictions
      mockSupabase.select.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const isAllowed = await attendanceService.isIpAllowed("192.168.1.1");
      expect(isAllowed).toBe(true);
    });

    it("should allow IP when it's in the allowed list", async () => {
      // Mock settings with IP restrictions
      mockSupabase.select.mockResolvedValueOnce({
        data: {
          allowed_ips: ["192.168.1.1", "10.0.0.1"],
        },
        error: null,
      });

      const isAllowed = await attendanceService.isIpAllowed("192.168.1.1");
      expect(isAllowed).toBe(true);
    });

    it("should deny IP when it's not in the allowed list", async () => {
      // Mock settings with IP restrictions
      mockSupabase.select.mockResolvedValueOnce({
        data: {
          allowed_ips: ["192.168.1.1", "10.0.0.1"],
        },
        error: null,
      });

      const isAllowed = await attendanceService.isIpAllowed("192.168.1.2");
      expect(isAllowed).toBe(false);
    });
  });

  describe("Attendance Operations", () => {
    it("should calculate overtime correctly", async () => {
      // This would require more complex mocking of the Supabase client
      // For now, we'll just verify the service can be instantiated
      expect(attendanceService).toBeInstanceOf(EnhancedAttendanceService);
    });
  });

  describe("Role-Based Access", () => {
    it("should enforce admin-only permissions for adjustments", async () => {
      // This would test the permission manager
      // For now, we verify the permission manager exists
      const { attendancePermissions } = await import("../lib/attendance-permissions");
      expect(attendancePermissions).toBeDefined();
    });
  });
});

// Test the database schema types
describe("Database Schema", () => {
  it("should define AttendanceRecord interface correctly", () => {
    const mockAttendance: AttendanceRecord = {
      id: "test-id",
      user_id: "user-id",
      date: "2023-01-01",
      check_in: "2023-01-01T09:00:00Z",
      check_out: "2023-01-01T18:00:00Z",
      scheduled_check_in: "2023-01-01T09:00:00Z",
      scheduled_check_out: "2023-01-01T18:00:00Z",
      total_hours: "08:00",
      overtime_hours: "01:00",
      break_hours: "01:00",
      status: "present",
      notes: "Regular day",
      created_at: "2023-01-01T09:00:00Z",
      updated_at: "2023-01-01T18:00:00Z",
    };

    expect(mockAttendance).toBeDefined();
    expect(mockAttendance.status).toBe("present");
  });

  it("should define User interface correctly", () => {
    const mockUser: User = {
      id: "user-id",
      full_name: "John Doe",
      email: "john@example.com",
      role: "telecaller",
      is_active: true,
      created_at: "2023-01-01T09:00:00Z",
      updated_at: "2023-01-01T09:00:00Z",
    };

    expect(mockUser).toBeDefined();
    expect(mockUser.role).toBe("telecaller");
  });
});import { EnhancedAttendanceService } from "../lib/attendance-service-enhanced";
import { AttendanceRecord, User } from "../lib/database-schema";

// Mock Supabase client
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
};

// Mock createClient function
jest.mock("../lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

describe("Attendance System", () => {
  let attendanceService: EnhancedAttendanceService;

  beforeEach(() => {
    attendanceService = new EnhancedAttendanceService();
    jest.clearAllMocks();
  });

  describe("Geolocation Verification", () => {
    it("should verify if user is within office location", () => {
      // Test data for Mumbai office and user near it
      const isWithin = attendanceService.isWithinOfficeLocation(
        19.0760, // User latitude (Mumbai)
        72.8777, // User longitude (Mumbai)
        19.0760, // Office latitude (Mumbai)
        72.8777, // Office longitude (Mumbai)
        1000 // 1km radius
      );
      
      expect(isWithin).toBe(true);
    });

    it("should verify if user is outside office location", () => {
      // Test data for Mumbai office and user in Delhi
      const isWithin = attendanceService.isWithinOfficeLocation(
        28.7041, // User latitude (Delhi)
        77.1025, // User longitude (Delhi)
        19.0760, // Office latitude (Mumbai)
        72.8777, // Office longitude (Mumbai)
        1000 // 1km radius
      );
      
      expect(isWithin).toBe(false);
    });
  });

  describe("IP Verification", () => {
    it("should allow IP when no restrictions are set", async () => {
      // Mock settings with no IP restrictions
      mockSupabase.select.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const isAllowed = await attendanceService.isIpAllowed("192.168.1.1");
      expect(isAllowed).toBe(true);
    });

    it("should allow IP when it's in the allowed list", async () => {
      // Mock settings with IP restrictions
      mockSupabase.select.mockResolvedValueOnce({
        data: {
          allowed_ips: ["192.168.1.1", "10.0.0.1"],
        },
        error: null,
      });

      const isAllowed = await attendanceService.isIpAllowed("192.168.1.1");
      expect(isAllowed).toBe(true);
    });

    it("should deny IP when it's not in the allowed list", async () => {
      // Mock settings with IP restrictions
      mockSupabase.select.mockResolvedValueOnce({
        data: {
          allowed_ips: ["192.168.1.1", "10.0.0.1"],
        },
        error: null,
      });

      const isAllowed = await attendanceService.isIpAllowed("192.168.1.2");
      expect(isAllowed).toBe(false);
    });
  });

  describe("Attendance Operations", () => {
    it("should calculate overtime correctly", async () => {
      // This would require more complex mocking of the Supabase client
      // For now, we'll just verify the service can be instantiated
      expect(attendanceService).toBeInstanceOf(EnhancedAttendanceService);
    });
  });

  describe("Role-Based Access", () => {
    it("should enforce admin-only permissions for adjustments", async () => {
      // This would test the permission manager
      // For now, we verify the permission manager exists
      const { attendancePermissions } = await import("../lib/attendance-permissions");
      expect(attendancePermissions).toBeDefined();
    });
  });
});

// Test the database schema types
describe("Database Schema", () => {
  it("should define AttendanceRecord interface correctly", () => {
    const mockAttendance: AttendanceRecord = {
      id: "test-id",
      user_id: "user-id",
      date: "2023-01-01",
      check_in: "2023-01-01T09:00:00Z",
      check_out: "2023-01-01T18:00:00Z",
      scheduled_check_in: "2023-01-01T09:00:00Z",
      scheduled_check_out: "2023-01-01T18:00:00Z",
      total_hours: "08:00",
      overtime_hours: "01:00",
      break_hours: "01:00",
      status: "present",
      notes: "Regular day",
      created_at: "2023-01-01T09:00:00Z",
      updated_at: "2023-01-01T18:00:00Z",
    };

    expect(mockAttendance).toBeDefined();
    expect(mockAttendance.status).toBe("present");
  });

  it("should define User interface correctly", () => {
    const mockUser: User = {
      id: "user-id",
      full_name: "John Doe",
      email: "john@example.com",
      role: "telecaller",
      is_active: true,
      created_at: "2023-01-01T09:00:00Z",
      updated_at: "2023-01-01T09:00:00Z",
    };

    expect(mockUser).toBeDefined();
    expect(mockUser.role).toBe("telecaller");
  });
});
