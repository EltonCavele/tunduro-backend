import { BookingService } from 'src/modules/booking/services/booking.service';
import { CourtService } from 'src/modules/court/services/court.service';

describe('Service Re-exports', () => {
  it('should export BookingService', () => {
    expect(BookingService).toBeDefined();
  });

  it('should export CourtService', () => {
    expect(CourtService).toBeDefined();
  });
});
