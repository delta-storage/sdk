import { OPERATION_SCOPE } from './constants'
import axios from 'axios'
import { type Socket, io } from 'socket.io-client'
import { Directories } from './types'
export interface DeltaStorageConfig {
  apiKey: string
}

const isCommandAllowed = (scope: number, flag: number) => {
  if (scope === 0) return true
  return (scope & flag) === flag
}

const verifyAuthorizedCommand = (
  scope: number,
  flag: number,
  message = 'Operation is not allowed.'
) => {
  if (!isCommandAllowed(scope, flag)) {
    throw Error(message)
  }
}

class DeltaStorageSDK {
  public readonly apiKey: string
  public readonly scope: number
  public readonly host: string
  public readonly edgeToken: string
  public readonly listener: Socket

  constructor(config: DeltaStorageConfig) {
    const [_apiKeyId, scope, _userId, _hash, _edgeToken] =
      config.apiKey.split('.')
    this.apiKey = config.apiKey
    this.scope = parseInt(scope)

    if (process.env.NODE_ENV === 'development') {
      this.host = 'http://localhost:1337'
    } else {
      this.host = 'https://api.delta.storage'
    }
    this.host = this.host.slice(-1) === '/' ? this.host.slice(0, -1) : this.host
    this.edgeToken = _edgeToken
    this.listener = io(this.host, {
      auth: {
        token: config.apiKey
      },
      autoConnect: false
    })
  }

  async readFile(id?: string) {
    verifyAuthorizedCommand(
      this.scope,
      OPERATION_SCOPE.READ_FILE,
      'READ_FILE is not allowed.'
    )
    return axios.get(`${this.host}/api/files/${id ?? ''}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    })
  }

  async uploadFile(
    name: string,
    file: any,
    collectionName: string,
    directoryId: string
  ) {
    verifyAuthorizedCommand(
      this.scope,
      OPERATION_SCOPE.UPLOAD_FILE,
      'UPLOAD_FILE is not allowed.'
    )

    const formData = new FormData()
    formData.append('name', name)
    formData.append('file', file)
    formData.append('collectionName', collectionName)
    formData.append('directoryId', directoryId)
    formData.append('edgeToken', this.edgeToken)

    //TODO modify edgeToken to be included in apiKey
    return axios.post(`${this.host}/api/files/upload`, formData, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    })
  }

  async deleteFile(id: string) {
    verifyAuthorizedCommand(
      this.scope,
      OPERATION_SCOPE.DELETE_FILE,
      'DELETE_FILE is not allowed.'
    )
    return axios.delete(`${this.host}/api/files/${id}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    })
  }

  async renameFile(id: string, name: string) {
    verifyAuthorizedCommand(
      this.scope,
      OPERATION_SCOPE.UPLOAD_FILE | OPERATION_SCOPE.DELETE_FILE,
      'RENAME_FILE is not allowed.'
    )
    return axios.put(
      `${this.host}/api/files/${id}`,
      { name },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      }
    )
  }

  async readDirectory(id?: string): Promise<{
    data: {
      directories: Directories[]
      files: any[] // todo
    }
  }> {
    verifyAuthorizedCommand(
      this.scope,
      OPERATION_SCOPE.READ_DIRECTORY,
      'READ_DIRECTORY is not allowed.'
    )

    return axios.get(`${this.host}/api/directory/${id ?? ''}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    })
  }

  async readDirectoryBySegment(segments: string) {
    verifyAuthorizedCommand(
      this.scope,
      OPERATION_SCOPE.READ_DIRECTORY,
      'READ_DIRECTORY is not allowed.'
    )

    const query = segments.split('/').join('&segment=')

    return axios.get(`${this.host}/api/directory?segment=${query}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    })
  }

  async createDirectory(name: string, parentDirectoryId?: string) {
    verifyAuthorizedCommand(
      this.scope,
      OPERATION_SCOPE.CREATE_DIRECTORY,
      'CREATE_DIRECTORY is not allowed.'
    )

    return axios.post(
      `${this.host}/api/directory/create`,
      { name, parentDirectoryId },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      }
    )
  }

  async renameDirectory(id: string, name: string) {
    verifyAuthorizedCommand(
      this.scope,
      OPERATION_SCOPE.CREATE_DIRECTORY | OPERATION_SCOPE.DELETE_DIRECTORY,
      'UPDATE_DIRECTORY is not allowed.'
    )

    return axios.put(
      `${this.host}/api/directory/${id}`,
      { name },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      }
    )
  }

  async move(
    parentId: string,
    childrenIds: string[],
    childrenFileIds?: string[]
  ) {
    verifyAuthorizedCommand(
      this.scope,
      OPERATION_SCOPE.CREATE_DIRECTORY | OPERATION_SCOPE.DELETE_DIRECTORY,
      'UPDATE_DIRECTORY is not allowed.'
    )

    return axios.put(
      `${this.host}/api/directory/${parentId}`,
      { move: childrenIds, moveFiles: childrenFileIds },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      }
    )
  }

  async deleteDirectory(id: string) {
    verifyAuthorizedCommand(
      this.scope,
      OPERATION_SCOPE.DELETE_DIRECTORY,
      'DELETE_DIRECTORY is not allowed.'
    )

    return axios.delete(`${this.host}/api/directory/${id}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    })
  }

  async getTotalSize(): Promise<bigint> {
    const result = await axios.get(`${this.host}/api/total-size`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    })

    return result.data.totalSize
  }

  async readDirectorySize(id: string): Promise<bigint> {
    const result = await axios.get(`${this.host}/api/directory/${id}/size`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    })

    return result.data.totalSize
  }

  //LISTENERS

  connect() {
    this.listener.connect()
  }
  disconnect() {
    this.listener.disconnect()
  }

  disconnectReadDirectoryEvent() {
    this.listener.off('directory:change')
  }
  onDirectoryChange(callback: (data: any) => void) {
    return this.listener.on('directory:change', callback)
  }

  async onTotalSizeChange(callback: (data: any) => void) {
    this.onDirectoryChange(async () => {
      const totalSize = await this.getTotalSize()
      callback(totalSize)
    })
  }

  async onReadDirectoryEvent(
    id: string,
    onChange: (directory: { directories: Directories[]; files: any[] }) => void
  ) {
    this.listener.emit('directory:initialize')
    this.onDirectoryChange(async () => {
      const latestDirectory = (await this.readDirectory(id)).data
      onChange(latestDirectory)
    })
  }

  async onReadDirectorySegmentChange(
    segments: string,
    onChange: (data: any) => void
  ) {
    this.onDirectoryChange(async () => {
      const res = await this.readDirectoryBySegment(segments)
      onChange(res.data)
    })
  }
}
export default DeltaStorageSDK
