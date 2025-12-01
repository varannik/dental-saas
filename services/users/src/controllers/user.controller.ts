import { FastifyRequest, FastifyReply } from 'fastify';
import { UserService } from '../services/user.service';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const users = await this.userService.list();
    return reply.send({ data: users });
  };

  getById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const user = await this.userService.getById(request.params.id);
    return reply.send({ data: user });
  };

  update = async (
    request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
    reply: FastifyReply
  ) => {
    const user = await this.userService.update(request.params.id, request.body);
    return reply.send({ data: user });
  };

  delete = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    await this.userService.delete(request.params.id);
    return reply.status(204).send();
  };

  getRoles = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const roles = await this.userService.getRoles(request.params.id);
    return reply.send({ data: roles });
  };

  updateRoles = async (
    request: FastifyRequest<{ Params: { id: string }; Body: { roles: string[] } }>,
    reply: FastifyReply
  ) => {
    const roles = await this.userService.updateRoles(request.params.id, request.body.roles);
    return reply.send({ data: roles });
  };
}

