import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';

export function useUser() {
  const { data: session, status } = useSession();

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['user', session?.user?.id],
    queryFn: () => apiClient.get('/users/me'),
    enabled: status === 'authenticated',
  });

  return {
    user: user ?? session?.user,
    isLoading: status === 'loading' || isLoading,
    isAuthenticated: status === 'authenticated',
    error,
    refetch,
  };
}

