import { db } from '$lib/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy,
  where,
  Timestamp 
} from 'firebase/firestore';
import type { Member, MembershipType, MemberStatus, MemberForm } from '$lib/types';

const MEMBERS_COLLECTION = 'members';

export class MemberService {
  
  // Get all members
  static async getAllMembers(): Promise<Member[]> {
    try {
      const q = query(collection(db, MEMBERS_COLLECTION), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          // Auto-calculate status based on expiry date
          status: new Date(data.expiryDate) > new Date() ? 'Active' : 'Expired'
        } as Member;
      });
    } catch (error) {
      console.error('Error fetching members:', error);
      throw new Error('Failed to fetch members');
    }
  }

  // Get active members only
  static async getActiveMembers(): Promise<Member[]> {
    try {
      const members = await this.getAllMembers();
      return members.filter(member => member.status === 'Active');
    } catch (error) {
      console.error('Error fetching active members:', error);
      throw new Error('Failed to fetch active members');
    }
  }

  // Get members by membership type
  static async getMembersByType(membershipType: MembershipType): Promise<Member[]> {
    try {
      const q = query(
        collection(db, MEMBERS_COLLECTION), 
        where('membershipType', '==', membershipType),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          status: new Date(data.expiryDate) > new Date() ? 'Active' : 'Expired'
        } as Member;
      });
    } catch (error) {
      console.error('Error fetching members by type:', error);
      throw new Error('Failed to fetch members by type');
    }
  }

  // Add new member
  static async addMember(memberData: MemberForm): Promise<string> {
    try {
      const newMember = {
        name: memberData.name.trim(),
        contact: memberData.contact.trim(),
        membershipType: memberData.membershipType,
        startDate: memberData.startDate,
        expiryDate: memberData.expiryDate || this.calculateExpiryDate(memberData.membershipType, memberData.startDate),
        status: this.calculateStatus(memberData.expiryDate || this.calculateExpiryDate(memberData.membershipType, memberData.startDate)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, MEMBERS_COLLECTION), newMember);
      return docRef.id;
    } catch (error) {
      console.error('Error adding member:', error);
      throw new Error('Failed to add member');
    }
  }

  // Update member
  static async updateMember(memberId: string, memberData: MemberForm): Promise<void> {
    try {
      const updatedMember = {
        name: memberData.name.trim(),
        contact: memberData.contact.trim(),
        membershipType: memberData.membershipType,
        startDate: memberData.startDate,
        expiryDate: memberData.expiryDate || this.calculateExpiryDate(memberData.membershipType, memberData.startDate),
        status: this.calculateStatus(memberData.expiryDate || this.calculateExpiryDate(memberData.membershipType, memberData.startDate)),
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, MEMBERS_COLLECTION, memberId), updatedMember);
    } catch (error) {
      console.error('Error updating member:', error);
      throw new Error('Failed to update member');
    }
  }

  // Delete member
  static async deleteMember(memberId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, MEMBERS_COLLECTION, memberId));
    } catch (error) {
      console.error('Error deleting member:', error);
      throw new Error('Failed to delete member');
    }
  }

  // Calculate expiry date based on membership type
  static calculateExpiryDate(membershipType: MembershipType, startDate: string): string {
    const start = new Date(startDate);
    const expiry = new Date(start);

    switch (membershipType) {
      case 'Day Pass':
        expiry.setDate(start.getDate() + 1);
        break;
      case 'Warrior Pass':
        expiry.setMonth(start.getMonth() + 1);
        break;
      case 'Gladiator Pass':
        // Custom duration - return start date + 30 days as default
        expiry.setDate(start.getDate() + 30);
        break;
      case 'Alpha Elite Pass':
        expiry.setMonth(start.getMonth() + 3);
        break;
      default:
        expiry.setMonth(start.getMonth() + 1);
    }

    return expiry.toISOString().split('T')[0];
  }

  // Calculate status based on expiry date
  static calculateStatus(expiryDate: string): MemberStatus {
    return new Date(expiryDate) > new Date() ? 'Active' : 'Expired';
  }

  // Get membership statistics
  static async getMembershipStats() {
    try {
      const members = await this.getAllMembers();
      
      const stats = {
        total: members.length,
        active: members.filter(m => m.status === 'Active').length,
        expired: members.filter(m => m.status === 'Expired').length,
        byType: {
          'Day Pass': members.filter(m => m.membershipType === 'Day Pass').length,
          'Warrior Pass': members.filter(m => m.membershipType === 'Warrior Pass').length,
          'Gladiator Pass': members.filter(m => m.membershipType === 'Gladiator Pass').length,
          'Alpha Elite Pass': members.filter(m => m.membershipType === 'Alpha Elite Pass').length,
        },
        activeByType: {
          'Day Pass': members.filter(m => m.membershipType === 'Day Pass' && m.status === 'Active').length,
          'Warrior Pass': members.filter(m => m.membershipType === 'Warrior Pass' && m.status === 'Active').length,
          'Gladiator Pass': members.filter(m => m.membershipType === 'Gladiator Pass' && m.status === 'Active').length,
          'Alpha Elite Pass': members.filter(m => m.membershipType === 'Alpha Elite Pass' && m.status === 'Active').length,
        }
      };

      return stats;
    } catch (error) {
      console.error('Error getting membership stats:', error);
      throw new Error('Failed to get membership statistics');
    }
  }

  // Check for expiring memberships (within next 7 days)
  static async getExpiringMemberships(days: number = 7): Promise<Member[]> {
    try {
      const members = await this.getActiveMembers();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + days);

      return members.filter(member => {
        const expiryDate = new Date(member.expiryDate);
        return expiryDate <= cutoffDate && expiryDate >= new Date();
      });
    } catch (error) {
      console.error('Error getting expiring memberships:', error);
      throw new Error('Failed to get expiring memberships');
    }
  }

  // Validate member data
  static validateMemberData(memberData: MemberForm): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    if (!memberData.name?.trim()) {
      errors.name = 'Name is required';
    }

    if (!memberData.contact?.trim()) {
      errors.contact = 'Contact is required';
    } else if (!/^\d{10,15}$/.test(memberData.contact.replace(/\D/g, ''))) {
      errors.contact = 'Please enter a valid contact number';
    }

    if (!memberData.startDate) {
      errors.startDate = 'Start date is required';
    }

    if (!memberData.expiryDate) {
      errors.expiryDate = 'Expiry date is required';
    }

    if (memberData.startDate && memberData.expiryDate && 
        new Date(memberData.expiryDate) <= new Date(memberData.startDate)) {
      errors.expiryDate = 'Expiry date must be after start date';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
}